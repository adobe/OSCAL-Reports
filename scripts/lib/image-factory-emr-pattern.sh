#!/usr/bin/env bash
# Copyright 2026 Adobe. All rights reserved.
# Copyright (c) 2026 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

# Single source of truth for the Image Factory EMR AMI name-match pattern, shared
# between terraform/scripts/resolve-latest-emr-ami.sh (the actual resolver Terraform's
# image_factory_ami.tf calls) and scripts/check-ami-drift.sh (the weekly drift check).
# Keeping this in one place means both always agree on what counts as an EMR AMI —
# previously each file hardcoded the identical literal independently, so a change to
# one without the other would let the resolver and the drift-checker silently diverge.

# Prevent double sourcing
[ -n "${_IMAGE_FACTORY_EMR_PATTERN_LOADED:-}" ] && return 0
_IMAGE_FACTORY_EMR_PATTERN_LOADED=1

IMAGE_FACTORY_EMR_NAME_PATTERN="${IMAGE_FACTORY_EMR_NAME_PATTERN:-*Amazon*Linux*2023*EMR*,*amazon*linux*2023*emr*}"
