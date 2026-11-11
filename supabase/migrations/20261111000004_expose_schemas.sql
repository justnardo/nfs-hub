-- Serve core + gateline through the Data API alongside public.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, core, gateline';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

-- Table privileges for signed-in staff (RLS decides rows).
grant select on all tables in schema core to authenticated;
grant select, insert, update, delete on all tables in schema gateline to authenticated;
grant usage, select on all sequences in schema core, gateline to authenticated;
grant execute on function core.current_role() to authenticated;
