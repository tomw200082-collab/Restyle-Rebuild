# PreToolUse — recorded run

```
### 1 - the constitution is not editable
ok    Edit CLAUDE.md                                 -> BLOCKED (exit 2)
         BLOCKED: CLAUDE.md is edited only by the operator.
ok    Write CLAUDE.md                                -> BLOCKED (exit 2)
         BLOCKED: CLAUDE.md is edited only by the operator.
ok    Edit SPEC.md (ordinary work)                   -> ALLOWED (exit 0)
ok    Edit EXECUTION_POLICY.md (L1, allowed)         -> ALLOWED (exit 0)

### 2 - destructive SQL through the MCP
ok    DROP TABLE                                     -> BLOCKED (exit 2)
         BLOCKED: this is a DROP outside supabase/migrations/.
ok    TRUNCATE                                       -> BLOCKED (exit 2)
         BLOCKED: this is a TRUNCATE outside supabase/migrations/.
ok    DELETE with no WHERE                           -> BLOCKED (exit 2)
         BLOCKED: this is a DELETE without a WHERE outside supabase/migrations/.
ok    DROP POLICY via apply_migration                -> BLOCKED (exit 2)
         BLOCKED: this is a DROP outside supabase/migrations/.

### 3 - legitimate SQL still runs
ok    DELETE with a WHERE                            -> ALLOWED (exit 0)
ok    SELECT                                         -> ALLOWED (exit 0)
ok    CREATE TABLE (a real migration)                -> ALLOWED (exit 0)

### 4 - Bash, including the false positive the first version had
ok    psql running a DROP                            -> BLOCKED (exit 2)
         BLOCKED: this is a DROP outside supabase/migrations/.
ok    grep that merely mentions DROP                 -> ALLOWED (exit 0)
ok    npm run build                                  -> ALLOWED (exit 0)
ok    heredoc that merely contains one               -> ALLOWED (exit 0)

15 correct, 0 wrong
```
