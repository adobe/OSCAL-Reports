/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Extract ISM catalogue metadata from OSCAL control props and groups.
 */

const PROP_ALIASES = {
  revision: ['revision', 'ism-revision', 'control-revision'],
  updated: ['updated', 'ism-updated', 'last-updated', 'date-updated'],
  nc: ['nc', 'ism-nc', 'classification-nc'],
  os: ['os', 'ism-os', 'classification-os'],
  p: ['p', 'ism-p', 'classification-p'],
  s: ['s', 'ism-s', 'classification-s'],
  ts: ['ts', 'ism-ts', 'classification-ts'],
  ml1: ['ml1', 'ism-ml1'],
  ml2: ['ml2', 'ism-ml2'],
  ml3: ['ml3', 'ism-ml3'],
  guideline: ['guideline', 'ism-guideline', 'control-guideline'],
  section: ['section', 'ism-section', 'control-section'],
  topic: ['topic', 'ism-topic', 'control-topic'],
  function: ['function', 'ism-function', 'control-function'],
  administrationEnvironment: ['administration-environment', 'administration-environment-guidance'],
  cloudProductionCommon: ['cloud-production-common', 'cloud-production-common-controls'],
  cloudProductionServiceSpecific: ['cloud-production-service-specific', 'cloud-production-service-specific-controls'],
  consumerResponsibility: ['consumer-responsibility'],
  consumerImplementationRequired: ['consumer-implementation-required'],
  consumerConfigurationRequired: ['consumer-configuration-required'],
};

/**
 * @param {Array<{name?: string, value?: string}>|undefined} props
 * @param {string} fieldKey
 * @returns {string}
 */
function getPropValue(props, fieldKey) {
  if (!Array.isArray(props) || props.length === 0) {
    return '';
  }
  const aliases = PROP_ALIASES[fieldKey] || [fieldKey];
  for (const alias of aliases) {
    const match = props.find(
      (p) => String(p?.name || '').toLowerCase() === alias.toLowerCase()
    );
    if (match?.value != null && String(match.value).trim() !== '') {
      return String(match.value).trim();
    }
  }
  return '';
}

/**
 * Flatten ISM metadata from OSCAL props onto a control object.
 * @param {Object} control
 * @param {{ guideline?: string, section?: string, function?: string }} [groupContext]
 * @returns {Object}
 */
export function enrichControlWithCatalogProps(control, groupContext = {}) {
  const props = control.props || [];
  const enriched = { ...control };

  for (const key of Object.keys(PROP_ALIASES)) {
    const fromProp = getPropValue(props, key);
    if (fromProp) {
      enriched[key] = fromProp;
    } else if (enriched[key] == null || enriched[key] === '') {
      enriched[key] = '';
    }
  }

  if (!enriched.guideline) {
    enriched.guideline = groupContext.guideline || control.groupTitle || '';
  }
  if (!enriched.section) {
    enriched.section = groupContext.section || control.parentGroupTitle || '';
  }
  if (!enriched.function) {
    enriched.function = groupContext.function || extractFunctionFromGroup(control.groupTitle);
  }
  if (!enriched.topic && control.title) {
    enriched.topic = control.title;
  }

  return enriched;
}

/**
 * @param {string|undefined} groupTitle
 * @returns {string}
 */
function extractFunctionFromGroup(groupTitle) {
  if (!groupTitle) return '';
  const upper = groupTitle.toUpperCase();
  const functions = ['GOVERN', 'IDENTIFY', 'PROTECT', 'DETECT', 'RESPOND', 'RECOVER'];
  for (const fn of functions) {
    if (upper.includes(fn)) {
      return fn.charAt(0) + fn.slice(1).toLowerCase();
    }
  }
  return groupTitle;
}

/**
 * @param {Object} catalogue
 * @returns {Array<Object>}
 */
export function extractControlsWithIsmMetadata(catalogue) {
  const controls = [];
  const catalog = catalogue?.catalog || catalogue;
  if (!catalog) {
    return controls;
  }

  const processGroup = (group, context = {}) => {
    const groupContext = {
      guideline: context.guideline || getPropValue(group.props, 'guideline') || group.title || '',
      section: group.title || context.section || '',
      function: context.function || extractFunctionFromGroup(group.title),
    };

    if (group.controls) {
      group.controls.forEach((control) => {
        controls.push(
          enrichControlWithCatalogProps(
            {
              id: control.id,
              class: control.class,
              title: control.title,
              description: extractDescription(control),
              params: control.params || [],
              props: control.props || [],
              parts: control.parts || [],
              groupId: group.id,
              groupTitle: group.title,
              parentGroupTitle: context.section || '',
              parentId: context.parentId || null,
            },
            groupContext
          )
        );

        if (control.controls) {
          control.controls.forEach((subControl) => {
            controls.push(
              enrichControlWithCatalogProps(
                {
                  id: subControl.id,
                  class: subControl.class,
                  title: subControl.title,
                  description: extractDescription(subControl),
                  params: subControl.params || [],
                  props: subControl.props || [],
                  parts: subControl.parts || [],
                  groupId: group.id,
                  groupTitle: group.title,
                  parentGroupTitle: group.title,
                  parentId: control.id,
                },
                { ...groupContext, section: group.title }
              )
            );
          });
        }
      });
    }

    if (group.groups) {
      group.groups.forEach((nested) =>
        processGroup(nested, {
          ...groupContext,
          parentId: group.id,
          guideline: groupContext.guideline,
          section: group.title,
        })
      );
    }
  };

  if (catalog.groups) {
    catalog.groups.forEach((group) => processGroup(group));
  }

  if (catalog.controls) {
    catalog.controls.forEach((control) => {
      controls.push(
        enrichControlWithCatalogProps({
          id: control.id,
          class: control.class,
          title: control.title,
          description: extractDescription(control),
          params: control.params || [],
          props: control.props || [],
          parts: control.parts || [],
          groupId: null,
          groupTitle: null,
          parentId: null,
        })
      );
    });
  }

  return controls;
}

/**
 * @param {Object} control
 * @returns {string}
 */
function extractDescription(control) {
  if (!control.parts || control.parts.length === 0) {
    return '';
  }
  const descParts = control.parts.filter(
    (part) =>
      part.name === 'statement' || part.name === 'description' || part.name === 'guidance'
  );
  if (descParts.length === 0) {
    return control.parts.map((p) => p.prose).filter(Boolean).join('\n\n');
  }
  return descParts.map((p) => p.prose).filter(Boolean).join('\n\n');
}

export { getPropValue, PROP_ALIASES };
