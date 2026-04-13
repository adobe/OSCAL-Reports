import { inferAwsRegionFromRdsHostname } from '../../../backend/database/dbClient.js';

describe('inferAwsRegionFromRdsHostname', () => {
  test('parses standard RDS endpoint', () => {
    expect(
      inferAwsRegionFromRdsHostname('ams-oscal-reports-pg.abc123xyz.us-east-1.rds.amazonaws.com')
    ).toBe('us-east-1');
  });

  test('parses ap-southeast-2', () => {
    expect(inferAwsRegionFromRdsHostname('db.xyzzy.ap-southeast-2.rds.amazonaws.com')).toBe('ap-southeast-2');
  });

  test('returns null for custom hostname', () => {
    expect(inferAwsRegionFromRdsHostname('postgres.internal.company')).toBeNull();
  });

  test('returns null for empty', () => {
    expect(inferAwsRegionFromRdsHostname('')).toBeNull();
  });
});
