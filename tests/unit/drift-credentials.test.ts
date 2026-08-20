import { describe, expect, it, afterEach } from 'vitest';
import { explain, failureText, pgEnv, scrub } from '../../scripts/drift-check';

/**
 * Regression test for [D-89].
 *
 * The weekly drift check passed the connection string to psql as an argument.
 * A database password containing `%` made psql reject the URI with
 * `invalid percent-encoded token: "<the password>"`, the script printed that
 * message, and it landed in the log of a **public** repository. GitHub's secret
 * masking did not catch it: the fragment psql quoted is not the whole string
 * the masker was given.
 *
 * Two properties are pinned:
 *   1. credentials travel in the environment, never in argv;
 *   2. anything on its way to a log has the password removed first.
 */

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('psql credentials never reach the command line', () => {
  it('splits a connection string into PG* variables', () => {
    const env = pgEnv('postgresql://postgres:s3cret@db.example.co:6543/postgres');
    expect(env.PGHOST).toBe('db.example.co');
    expect(env.PGPORT).toBe('6543');
    expect(env.PGUSER).toBe('postgres');
    expect(env.PGPASSWORD).toBe('s3cret');
    expect(env.PGDATABASE).toBe('postgres');
  });

  it('accepts the password that caused the leak — a bare % is not fatal', () => {
    // The exact shape that broke it: `%R2` is not valid percent-encoding, so
    // decodeURIComponent throws. Falling back to the raw value means the
    // operator does not have to know URI encoding rules to configure a secret.
    const env = pgEnv('postgresql://postgres:ab%R2!x@db.example.co:5432/postgres');
    expect(env.PGPASSWORD).toBe('ab%R2!x');
  });

  it('decodes a properly percent-encoded password', () => {
    const env = pgEnv('postgresql://postgres:a%25b%40c@db.example.co:5432/postgres');
    expect(env.PGPASSWORD).toBe('a%b@c');
  });

  it('names the problem when the secret is not a URI at all', () => {
    // psql would treat this as a database name and connect to the local socket,
    // failing with a message that mentions neither the secret nor the cause.
    expect(() => pgEnv('fv6u5JCajkc')).toThrow(/must be a connection URI/);
    expect(() => pgEnv('fv6u5JCajkc')).toThrow(/Supabase/);
  });

  it('does not put the mis-pasted value itself in the message', () => {
    // The message quotes twelve characters for orientation, not the whole
    // secret — if somebody pastes a password here, this error is going to a log.
    const secret = 'super-secret-password-nobody-should-see';
    try {
      pgEnv(secret);
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it('defaults the port and database rather than emitting empty values', () => {
    const env = pgEnv('postgresql://postgres:p@db.example.co/');
    expect(env.PGPORT).toBe('5432');
    expect(env.PGDATABASE).toBe('postgres');
  });
});

describe('scrub keeps a password out of anything logged', () => {
  it('removes the password quoted back by a third-party tool', () => {
    process.env.SUPABASE_DB_URL = 'postgresql://postgres:fv6u5JCajkc@db.example.co:5432/postgres';
    const psqlError = 'psql: error: invalid percent-encoded token: "fv6u5JCajkc"';
    const cleaned = scrub(psqlError);
    expect(cleaned).not.toContain('fv6u5JCajkc');
    expect(cleaned).toContain('***');
  });

  it('removes the whole connection string too', () => {
    const url = 'postgresql://postgres:p4ssw0rd@db.example.co:5432/postgres';
    process.env.SUPABASE_DB_URL = url;
    expect(scrub(`Command failed: psql ${url} -tA`)).not.toContain('p4ssw0rd');
  });

  it('leaves ordinary text alone when no secret is set', () => {
    delete process.env.SUPABASE_DB_URL;
    delete process.env.DATABASE_URL;
    expect(scrub('31 migrations applied')).toBe('31 migrations applied');
  });
});

describe('an unreachable address explains itself', () => {
  it('names IPv6 and the pooler when the network is unreachable', () => {
    const psql =
      'connection to server at "db.abc.supabase.co" (2a05:d014:913:8602::1), port 5432 ' +
      'failed: Network is unreachable';
    const out = explain(psql);
    expect(out).toContain('IPv6');
    expect(out).toContain('session pooler');
    expect(out).toContain('pooler.supabase.com');
  });

  it('leaves an unrelated failure exactly as it found it', () => {
    const other = 'password authentication failed for user "postgres"';
    expect(explain(other)).toBe(other);
  });
});

describe('a failure prints what the tool said, not what we asked it', () => {
  it('prefers stderr over the echoed command', () => {
    const error = Object.assign(new Error('Command failed: psql -c with objs as (select …600 more chars…)'), {
      stderr: 'psql: error: connection to server failed: Network is unreachable\n',
    });
    // The CI log carried sixty lines of introspection SQL above the one line
    // that named the problem, and the reader stops at the top. [D-92]
    expect(failureText(error)).toBe('psql: error: connection to server failed: Network is unreachable');
  });

  it('falls back to the message when there is no stderr — our own throws have none', () => {
    expect(failureText(new Error('SUPABASE_DB_URL must be a connection URI'))).toBe(
      'SUPABASE_DB_URL must be a connection URI',
    );
  });

  it('treats an empty stderr as absent rather than printing nothing at all', () => {
    expect(failureText(Object.assign(new Error('exited with code 2'), { stderr: '   \n' }))).toBe(
      'exited with code 2',
    );
  });

  it('survives being handed something that is not an Error', () => {
    expect(failureText('psql went missing')).toBe('psql went missing');
    expect(failureText(null)).toBe('null');
  });
});
