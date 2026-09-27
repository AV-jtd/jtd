-- Права (GRANT / ALTER DEFAULT PRIVILEGES) боевой базы на 27.09.2026.
--
-- Нужен ТОЛЬКО для восстановления из копий, снятых до 27.09.2026: их снимали с
-- --no-acl, и права в них не попали — без них PostgREST не пустит к таблицам.
-- restore.sh применяет этот файл сам, если в дампе нет ни одной записи ACL.
-- Копии, снятые позже, несут права в себе, и файл им не нужен.
--
-- Получен из дампа: pg_restore -l | grep ACL, затем pg_restore -L. Данных и
-- секретов здесь нет. Объекты, которых не было в более старой копии, дадут
-- ошибки "does not exist" — это ожидаемо, restore.sh их не считает сбоем.

--
-- PostgreSQL database dump
--


-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.18

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO dashboard_user;
GRANT ALL ON SCHEMA auth TO postgres;


--
-- Name: SCHEMA cron; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA cron TO postgres WITH GRANT OPTION;


--
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT ALL ON SCHEMA extensions TO dashboard_user;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: SCHEMA net; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA net TO supabase_functions_admin;
GRANT USAGE ON SCHEMA net TO postgres;
GRANT USAGE ON SCHEMA net TO anon;
GRANT USAGE ON SCHEMA net TO authenticated;
GRANT USAGE ON SCHEMA net TO service_role;


--
-- Name: SCHEMA realtime; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA realtime TO postgres;
GRANT USAGE ON SCHEMA realtime TO anon;
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT USAGE ON SCHEMA realtime TO service_role;
GRANT ALL ON SCHEMA realtime TO supabase_realtime_admin;


--
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT ALL ON SCHEMA storage TO postgres;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON SCHEMA storage TO dashboard_user;


--
-- Name: SCHEMA vault; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA vault TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION email(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.email() TO dashboard_user;


--
-- Name: FUNCTION jwt(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.jwt() TO postgres;
GRANT ALL ON FUNCTION auth.jwt() TO dashboard_user;


--
-- Name: FUNCTION role(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.role() TO dashboard_user;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.uid() TO dashboard_user;


--
-- Name: FUNCTION alter_job(job_id bigint, schedule text, command text, database text, username text, active boolean); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.alter_job(job_id bigint, schedule text, command text, database text, username text, active boolean) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION job_cache_invalidate(); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.job_cache_invalidate() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION schedule(schedule text, command text); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.schedule(schedule text, command text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION schedule(job_name text, schedule text, command text); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.schedule(job_name text, schedule text, command text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION schedule_in_database(job_name text, schedule text, command text, database text, username text, active boolean); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.schedule_in_database(job_name text, schedule text, command text, database text, username text, active boolean) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION unschedule(job_id bigint); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.unschedule(job_id bigint) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION unschedule(job_name text); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION cron.unschedule(job_name text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION algorithm_sign(signables text, secret text, algorithm text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.algorithm_sign(signables text, secret text, algorithm text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.algorithm_sign(signables text, secret text, algorithm text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.armor(bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.crypt(text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.dearmor(text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.digest(text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_salt(text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.grant_pg_cron_access() FROM postgres;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO dashboard_user;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.grant_pg_graphql_access() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_net_access(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.grant_pg_net_access() FROM postgres;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO dashboard_user;


--
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT blk_read_time double precision, OUT blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT blk_read_time double precision, OUT blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements_reset(userid oid, dbid oid, queryid bigint); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_ddl_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_ddl_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_drop_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_drop_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.set_graphql_placeholder() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION sign(payload json, secret text, algorithm text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.sign(payload json, secret text, algorithm text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.sign(payload json, secret text, algorithm text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION try_cast_double(inp text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.try_cast_double(inp text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.try_cast_double(inp text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION url_decode(data text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.url_decode(data text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.url_decode(data text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION url_encode(data bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.url_encode(data bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.url_encode(data bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_nil() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION verify(token text, secret text, algorithm text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.verify(token text, secret text, algorithm text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.verify(token text, secret text, algorithm text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION graphql("operationName" text, query text, variables jsonb, extensions jsonb); Type: ACL; Schema: graphql_public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO postgres;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO anon;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO authenticated;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO service_role;


--
-- Name: FUNCTION get_auth(p_usename text); Type: ACL; Schema: pgbouncer; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION pgbouncer.get_auth(p_usename text) FROM PUBLIC;
GRANT ALL ON FUNCTION pgbouncer.get_auth(p_usename text) TO pgbouncer;
GRANT ALL ON FUNCTION pgbouncer.get_auth(p_usename text) TO postgres;


--
-- Name: FUNCTION admin_delete_user(target_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.admin_delete_user(target_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_delete_user(target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_delete_user(target_user_id uuid) TO service_role;


--
-- Name: FUNCTION admin_exists(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.admin_exists() TO anon;
GRANT ALL ON FUNCTION public.admin_exists() TO authenticated;
GRANT ALL ON FUNCTION public.admin_exists() TO service_role;


--
-- Name: FUNCTION admin_hard_delete_user(target_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.admin_hard_delete_user(target_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_hard_delete_user(target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_hard_delete_user(target_user_id uuid) TO service_role;


--
-- Name: FUNCTION admin_restore_user(target_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.admin_restore_user(target_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_restore_user(target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_restore_user(target_user_id uuid) TO service_role;


--
-- Name: FUNCTION admin_set_users_department(user_ids uuid[], dept_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.admin_set_users_department(user_ids uuid[], dept_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_set_users_department(user_ids uuid[], dept_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_users_department(user_ids uuid[], dept_id uuid) TO service_role;


--
-- Name: FUNCTION admin_soft_delete_user(target_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.admin_soft_delete_user(target_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_soft_delete_user(target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_soft_delete_user(target_user_id uuid) TO service_role;


--
-- Name: FUNCTION auto_assign_project_tag_category(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.auto_assign_project_tag_category() TO anon;
GRANT ALL ON FUNCTION public.auto_assign_project_tag_category() TO authenticated;
GRANT ALL ON FUNCTION public.auto_assign_project_tag_category() TO service_role;


--
-- Name: FUNCTION auto_set_source_protocol(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.auto_set_source_protocol() TO anon;
GRANT ALL ON FUNCTION public.auto_set_source_protocol() TO authenticated;
GRANT ALL ON FUNCTION public.auto_set_source_protocol() TO service_role;


--
-- Name: FUNCTION can_access_dependency(_dep_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_access_dependency(_dep_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_access_dependency(_dep_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_dependency(_dep_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION can_see_decision(_decision_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_see_decision(_decision_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_see_decision(_decision_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_see_decision(_decision_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION can_see_task(_user_id uuid, _task_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_see_task(_user_id uuid, _task_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_see_task(_user_id uuid, _task_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_see_task(_user_id uuid, _task_id uuid) TO service_role;


--
-- Name: FUNCTION can_see_task_row(_user_id uuid, _task_user_id uuid, _task_assigned_to uuid, _task_id uuid, _task_group_id uuid, _task_department_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_see_task_row(_user_id uuid, _task_user_id uuid, _task_assigned_to uuid, _task_id uuid, _task_group_id uuid, _task_department_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_see_task_row(_user_id uuid, _task_user_id uuid, _task_assigned_to uuid, _task_id uuid, _task_group_id uuid, _task_department_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_see_task_row(_user_id uuid, _task_user_id uuid, _task_assigned_to uuid, _task_id uuid, _task_group_id uuid, _task_department_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_profile(_profile_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_profile(_profile_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_profile(_profile_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_profile(_profile_id uuid) TO service_role;


--
-- Name: FUNCTION can_view_tag(_tag_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_view_tag(_tag_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION check_department_hierarchy(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_department_hierarchy() TO anon;
GRANT ALL ON FUNCTION public.check_department_hierarchy() TO authenticated;
GRANT ALL ON FUNCTION public.check_department_hierarchy() TO service_role;


--
-- Name: FUNCTION consultant_can_see_group(_user_id uuid, _group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.consultant_can_see_group(_user_id uuid, _group_id uuid) TO anon;
GRANT ALL ON FUNCTION public.consultant_can_see_group(_user_id uuid, _group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.consultant_can_see_group(_user_id uuid, _group_id uuid) TO service_role;


--
-- Name: FUNCTION consultant_can_see_tag(_user_id uuid, _tag_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.consultant_can_see_tag(_user_id uuid, _tag_id uuid) TO anon;
GRANT ALL ON FUNCTION public.consultant_can_see_tag(_user_id uuid, _tag_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.consultant_can_see_tag(_user_id uuid, _tag_id uuid) TO service_role;


--
-- Name: FUNCTION consultant_can_see_task(_user_id uuid, _task_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.consultant_can_see_task(_user_id uuid, _task_id uuid) TO anon;
GRANT ALL ON FUNCTION public.consultant_can_see_task(_user_id uuid, _task_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.consultant_can_see_task(_user_id uuid, _task_id uuid) TO service_role;


--
-- Name: FUNCTION consultant_can_see_user(_viewer uuid, _target uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.consultant_can_see_user(_viewer uuid, _target uuid) TO anon;
GRANT ALL ON FUNCTION public.consultant_can_see_user(_viewer uuid, _target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.consultant_can_see_user(_viewer uuid, _target uuid) TO service_role;


--
-- Name: FUNCTION consultant_company(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.consultant_company(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.consultant_company(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.consultant_company(_user_id uuid) TO service_role;


--
-- Name: FUNCTION copy_protocol_system_tags_to_task(_task_id uuid, _protocol_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.copy_protocol_system_tags_to_task(_task_id uuid, _protocol_id uuid) TO anon;
GRANT ALL ON FUNCTION public.copy_protocol_system_tags_to_task(_task_id uuid, _protocol_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.copy_protocol_system_tags_to_task(_task_id uuid, _protocol_id uuid) TO service_role;


--
-- Name: FUNCTION create_default_kanban_columns(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_default_kanban_columns() TO anon;
GRANT ALL ON FUNCTION public.create_default_kanban_columns() TO authenticated;
GRANT ALL ON FUNCTION public.create_default_kanban_columns() TO service_role;


--
-- Name: FUNCTION debug_user_visible_groups(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.debug_user_visible_groups(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.debug_user_visible_groups(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.debug_user_visible_groups(_user_id uuid) TO service_role;


--
-- Name: FUNCTION decisions_set_user_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.decisions_set_user_id() TO anon;
GRANT ALL ON FUNCTION public.decisions_set_user_id() TO authenticated;
GRANT ALL ON FUNCTION public.decisions_set_user_id() TO service_role;


--
-- Name: FUNCTION delegation_profile_ids(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.delegation_profile_ids(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delegation_profile_ids(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delegation_profile_ids(_user_id uuid) TO service_role;


--
-- Name: FUNCTION department_depth(_dept_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.department_depth(_dept_id uuid) TO anon;
GRANT ALL ON FUNCTION public.department_depth(_dept_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.department_depth(_dept_id uuid) TO service_role;


--
-- Name: FUNCTION enforce_assignee_exclusivity(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.enforce_assignee_exclusivity() TO anon;
GRANT ALL ON FUNCTION public.enforce_assignee_exclusivity() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_assignee_exclusivity() TO service_role;


--
-- Name: FUNCTION ensure_protocol_review_task(_protocol_id uuid, _assignee uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.ensure_protocol_review_task(_protocol_id uuid, _assignee uuid) TO anon;
GRANT ALL ON FUNCTION public.ensure_protocol_review_task(_protocol_id uuid, _assignee uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_protocol_review_task(_protocol_id uuid, _assignee uuid) TO service_role;


--
-- Name: FUNCTION get_department_descendants(_dept_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_department_descendants(_dept_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_department_descendants(_dept_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_department_descendants(_dept_id uuid) TO service_role;


--
-- Name: FUNCTION get_group_task_stats(_group_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_group_task_stats(_group_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_group_task_stats(_group_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_group_task_stats(_group_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_my_auth_meta(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_my_auth_meta() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_auth_meta() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_auth_meta() TO service_role;


--
-- Name: FUNCTION get_my_profile_approval(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_my_profile_approval() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_profile_approval() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_profile_approval() TO service_role;
GRANT ALL ON FUNCTION public.get_my_profile_approval() TO anon;


--
-- Name: FUNCTION get_unread_threads(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_unread_threads() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_unread_threads() TO anon;
GRANT ALL ON FUNCTION public.get_unread_threads() TO authenticated;
GRANT ALL ON FUNCTION public.get_unread_threads() TO service_role;


--
-- Name: FUNCTION get_user_departments(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_user_departments(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_departments(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_departments(_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_user_visible_departments(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_user_visible_departments(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_user_visible_departments(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_visible_departments(_user_id uuid) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO anon;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
-- Name: FUNCTION has_tag_access(_tag_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.has_tag_access(_tag_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.has_tag_access(_tag_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.has_tag_access(_tag_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION inherit_group_client_on_task(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.inherit_group_client_on_task() TO anon;
GRANT ALL ON FUNCTION public.inherit_group_client_on_task() TO authenticated;
GRANT ALL ON FUNCTION public.inherit_group_client_on_task() TO service_role;


--
-- Name: FUNCTION is_consultant(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_consultant(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_consultant(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_consultant(_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_delegatee_in_group(_group_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_delegatee_in_group(_group_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_delegatee_in_group(_group_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_delegatee_in_group(_group_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_director_of_department(_user_id uuid, _dept_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_director_of_department(_user_id uuid, _dept_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_director_of_department(_user_id uuid, _dept_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_director_of_department(_user_id uuid, _dept_id uuid) TO service_role;


--
-- Name: FUNCTION is_director_of_user(_director_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_director_of_user(_director_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_director_of_user(_director_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_director_of_user(_director_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_full_group_member(_group_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_full_group_member(_group_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_full_group_member(_group_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_full_group_member(_group_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_group_member(_group_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_group_member(_group_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_member(_group_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_member(_group_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_group_owner(_group_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_message_in_parent_member_group(_group_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_message_in_parent_member_group(_group_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_message_in_parent_member_group(_group_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_message_in_parent_member_group(_group_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_npd_stm_group(_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_npd_stm_group(_group_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_npd_stm_group(_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_npd_stm_group(_group_id uuid) TO service_role;


--
-- Name: FUNCTION is_parent_of_member_group(_parent_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_parent_of_member_group(_parent_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_parent_of_member_group(_parent_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_parent_of_member_group(_parent_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_protocol_draft(_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_protocol_draft(_group_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_protocol_draft(_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_protocol_draft(_group_id uuid) TO service_role;


--
-- Name: FUNCTION is_protocol_internal_attendee(_group_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_protocol_internal_attendee(_group_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_protocol_internal_attendee(_group_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_protocol_internal_attendee(_group_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_subgroup_of_member_group(_group_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_subgroup_of_member_group(_group_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_subgroup_of_member_group(_group_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_subgroup_of_member_group(_group_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_subgroup_of_owner_group(_group_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_subgroup_of_owner_group(_group_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_subgroup_of_owner_group(_group_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_subgroup_of_owner_group(_group_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_subgroup_owner(_parent_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_subgroup_owner(_parent_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_subgroup_owner(_parent_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_subgroup_owner(_parent_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_supervisor_of_user(_supervisor_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_supervisor_of_user(_supervisor_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_supervisor_of_user(_supervisor_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_supervisor_of_user(_supervisor_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_supervisor_task_in_shared_group(_task_id uuid, _supervisor_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_supervisor_task_in_shared_group(_task_id uuid, _supervisor_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_supervisor_task_in_shared_group(_task_id uuid, _supervisor_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_supervisor_task_in_shared_group(_task_id uuid, _supervisor_id uuid) TO service_role;


--
-- Name: FUNCTION is_task_in_member_group(_task_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_task_in_member_group(_task_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_task_in_member_group(_task_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_task_in_member_group(_task_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_task_in_parent_member_group(_task_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_task_in_parent_member_group(_task_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_task_in_parent_member_group(_task_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_task_in_parent_member_group(_task_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_task_in_parent_owner_group(_task_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_task_in_parent_owner_group(_task_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_task_in_parent_owner_group(_task_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_task_in_parent_owner_group(_task_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_task_in_protocol_attendee_scope(_task_id uuid, _user_id uuid, _draft_only boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_task_in_protocol_attendee_scope(_task_id uuid, _user_id uuid, _draft_only boolean) TO anon;
GRANT ALL ON FUNCTION public.is_task_in_protocol_attendee_scope(_task_id uuid, _user_id uuid, _draft_only boolean) TO authenticated;
GRANT ALL ON FUNCTION public.is_task_in_protocol_attendee_scope(_task_id uuid, _user_id uuid, _draft_only boolean) TO service_role;


--
-- Name: FUNCTION is_task_in_user_group(_task_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_task_in_user_group(_task_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_task_in_user_group(_task_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_task_in_user_group(_task_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_task_owner(_task_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_task_owner(_task_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_task_owner(_task_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_task_owner(_task_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_task_participant(_task_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_task_participant(_task_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_task_participant(_task_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_task_participant(_task_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_task_visible(_task_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_task_visible(_task_id uuid, _user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_task_visible(_task_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_task_visible(_task_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_team_director(_team_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_team_director(_team_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_team_director(_team_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_team_director(_team_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_team_member(_team_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_team_member(_team_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_team_member(_team_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_team_member(_team_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION is_user_active(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_user_active(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_user_active(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_user_active(_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_user_in_task_department(_task_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_user_in_task_department(_task_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_user_in_task_department(_task_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_user_in_task_department(_task_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION log_profile_changes(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.log_profile_changes() TO anon;
GRANT ALL ON FUNCTION public.log_profile_changes() TO authenticated;
GRANT ALL ON FUNCTION public.log_profile_changes() TO service_role;


--
-- Name: FUNCTION log_task_field_changes(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.log_task_field_changes() TO anon;
GRANT ALL ON FUNCTION public.log_task_field_changes() TO authenticated;
GRANT ALL ON FUNCTION public.log_task_field_changes() TO service_role;


--
-- Name: FUNCTION manage_client_team(_client_id uuid, _member_id uuid, _action text, _role text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.manage_client_team(_client_id uuid, _member_id uuid, _action text, _role text) TO anon;
GRANT ALL ON FUNCTION public.manage_client_team(_client_id uuid, _member_id uuid, _action text, _role text) TO authenticated;
GRANT ALL ON FUNCTION public.manage_client_team(_client_id uuid, _member_id uuid, _action text, _role text) TO service_role;


--
-- Name: FUNCTION mark_thread_read(_thread_id text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mark_thread_read(_thread_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_thread_read(_thread_id text) TO anon;
GRANT ALL ON FUNCTION public.mark_thread_read(_thread_id text) TO authenticated;
GRANT ALL ON FUNCTION public.mark_thread_read(_thread_id text) TO service_role;


--
-- Name: FUNCTION notify_department_head_on_assign(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_department_head_on_assign() TO anon;
GRANT ALL ON FUNCTION public.notify_department_head_on_assign() TO authenticated;
GRANT ALL ON FUNCTION public.notify_department_head_on_assign() TO service_role;


--
-- Name: FUNCTION notify_new_user_registration(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_new_user_registration() TO anon;
GRANT ALL ON FUNCTION public.notify_new_user_registration() TO authenticated;
GRANT ALL ON FUNCTION public.notify_new_user_registration() TO service_role;


--
-- Name: FUNCTION prevent_duplicate_client(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.prevent_duplicate_client() TO anon;
GRANT ALL ON FUNCTION public.prevent_duplicate_client() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_duplicate_client() TO service_role;


--
-- Name: FUNCTION protect_is_approved(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.protect_is_approved() TO anon;
GRANT ALL ON FUNCTION public.protect_is_approved() TO authenticated;
GRANT ALL ON FUNCTION public.protect_is_approved() TO service_role;


--
-- Name: FUNCTION protect_system_protocol_templates(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.protect_system_protocol_templates() TO anon;
GRANT ALL ON FUNCTION public.protect_system_protocol_templates() TO authenticated;
GRANT ALL ON FUNCTION public.protect_system_protocol_templates() TO service_role;


--
-- Name: FUNCTION protect_system_tag_categories(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.protect_system_tag_categories() TO anon;
GRANT ALL ON FUNCTION public.protect_system_tag_categories() TO authenticated;
GRANT ALL ON FUNCTION public.protect_system_tag_categories() TO service_role;


--
-- Name: FUNCTION protocol_copyable_system_keys(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.protocol_copyable_system_keys() TO anon;
GRANT ALL ON FUNCTION public.protocol_copyable_system_keys() TO authenticated;
GRANT ALL ON FUNCTION public.protocol_copyable_system_keys() TO service_role;


--
-- Name: FUNCTION remove_protocol_system_tags_from_task(_task_id uuid, _protocol_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.remove_protocol_system_tags_from_task(_task_id uuid, _protocol_id uuid) TO anon;
GRANT ALL ON FUNCTION public.remove_protocol_system_tags_from_task(_task_id uuid, _protocol_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_protocol_system_tags_from_task(_task_id uuid, _protocol_id uuid) TO service_role;


--
-- Name: FUNCTION resolve_dependency_violations(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.resolve_dependency_violations() TO anon;
GRANT ALL ON FUNCTION public.resolve_dependency_violations() TO authenticated;
GRANT ALL ON FUNCTION public.resolve_dependency_violations() TO service_role;


--
-- Name: FUNCTION seed_onboarding_data(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.seed_onboarding_data(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.seed_onboarding_data(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.seed_onboarding_data(_user_id uuid) TO service_role;


--
-- Name: FUNCTION seed_protocol_status_for_user(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.seed_protocol_status_for_user(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.seed_protocol_status_for_user(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.seed_protocol_status_for_user(_user_id uuid) TO service_role;


--
-- Name: FUNCTION seed_protocol_templates(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.seed_protocol_templates(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.seed_protocol_templates(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.seed_protocol_templates(_user_id uuid) TO service_role;


--
-- Name: FUNCTION seed_system_tag_categories(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.seed_system_tag_categories(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.seed_system_tag_categories(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.seed_system_tag_categories(_user_id uuid) TO service_role;


--
-- Name: FUNCTION set_original_deadline(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_original_deadline() TO anon;
GRANT ALL ON FUNCTION public.set_original_deadline() TO authenticated;
GRANT ALL ON FUNCTION public.set_original_deadline() TO service_role;


--
-- Name: FUNCTION shared_page_get(p_key text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.shared_page_get(p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.shared_page_get(p_key text) TO anon;
GRANT ALL ON FUNCTION public.shared_page_get(p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.shared_page_get(p_key text) TO service_role;


--
-- Name: FUNCTION shared_page_put(p_key text, p_data jsonb, p_expected timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.shared_page_put(p_key text, p_data jsonb, p_expected timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.shared_page_put(p_key text, p_data jsonb, p_expected timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.shared_page_put(p_key text, p_data jsonb, p_expected timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.shared_page_put(p_key text, p_data jsonb, p_expected timestamp with time zone) TO service_role;


--
-- Name: FUNCTION sync_client_room_members(_group_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_client_room_members(_group_id uuid) TO anon;
GRANT ALL ON FUNCTION public.sync_client_room_members(_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sync_client_room_members(_group_id uuid) TO service_role;


--
-- Name: FUNCTION sync_consultant_role(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_consultant_role() TO anon;
GRANT ALL ON FUNCTION public.sync_consultant_role() TO authenticated;
GRANT ALL ON FUNCTION public.sync_consultant_role() TO service_role;


--
-- Name: FUNCTION sync_department_head_membership(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_department_head_membership() TO anon;
GRANT ALL ON FUNCTION public.sync_department_head_membership() TO authenticated;
GRANT ALL ON FUNCTION public.sync_department_head_membership() TO service_role;


--
-- Name: FUNCTION sync_linked_project_participants(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_linked_project_participants() TO anon;
GRANT ALL ON FUNCTION public.sync_linked_project_participants() TO authenticated;
GRANT ALL ON FUNCTION public.sync_linked_project_participants() TO service_role;


--
-- Name: FUNCTION sync_primary_department_to_profile(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_primary_department_to_profile() TO anon;
GRANT ALL ON FUNCTION public.sync_primary_department_to_profile() TO authenticated;
GRANT ALL ON FUNCTION public.sync_primary_department_to_profile() TO service_role;


--
-- Name: FUNCTION sync_stm_milestone_from_stage_task(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_stm_milestone_from_stage_task() TO anon;
GRANT ALL ON FUNCTION public.sync_stm_milestone_from_stage_task() TO authenticated;
GRANT ALL ON FUNCTION public.sync_stm_milestone_from_stage_task() TO service_role;


--
-- Name: FUNCTION task_has_tag_access(_task_id uuid, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.task_has_tag_access(_task_id uuid, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.task_has_tag_access(_task_id uuid, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.task_has_tag_access(_task_id uuid, _user_id uuid) TO service_role;


--
-- Name: FUNCTION trg_group_tags_sync_protocol_tasks(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trg_group_tags_sync_protocol_tasks() TO anon;
GRANT ALL ON FUNCTION public.trg_group_tags_sync_protocol_tasks() TO authenticated;
GRANT ALL ON FUNCTION public.trg_group_tags_sync_protocol_tasks() TO service_role;


--
-- Name: FUNCTION trg_protocol_draft_assignee_review(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trg_protocol_draft_assignee_review() TO anon;
GRANT ALL ON FUNCTION public.trg_protocol_draft_assignee_review() TO authenticated;
GRANT ALL ON FUNCTION public.trg_protocol_draft_assignee_review() TO service_role;


--
-- Name: FUNCTION trg_sync_client_room_on_client_update(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trg_sync_client_room_on_client_update() TO anon;
GRANT ALL ON FUNCTION public.trg_sync_client_room_on_client_update() TO authenticated;
GRANT ALL ON FUNCTION public.trg_sync_client_room_on_client_update() TO service_role;


--
-- Name: FUNCTION trg_sync_client_room_on_insert(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trg_sync_client_room_on_insert() TO anon;
GRANT ALL ON FUNCTION public.trg_sync_client_room_on_insert() TO authenticated;
GRANT ALL ON FUNCTION public.trg_sync_client_room_on_insert() TO service_role;


--
-- Name: FUNCTION trg_task_sync_protocol_context(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trg_task_sync_protocol_context() TO anon;
GRANT ALL ON FUNCTION public.trg_task_sync_protocol_context() TO authenticated;
GRANT ALL ON FUNCTION public.trg_task_sync_protocol_context() TO service_role;


--
-- Name: FUNCTION trigger_resolve_dependencies(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trigger_resolve_dependencies() TO anon;
GRANT ALL ON FUNCTION public.trigger_resolve_dependencies() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_resolve_dependencies() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION upsert_client_by_name(_name text, _user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.upsert_client_by_name(_name text, _user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.upsert_client_by_name(_name text, _user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_client_by_name(_name text, _user_id uuid) TO service_role;


--
-- Name: FUNCTION user_belongs_to_department(_user_id uuid, _department_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_belongs_to_department(_user_id uuid, _department_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_belongs_to_department(_user_id uuid, _department_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_belongs_to_department(_user_id uuid, _department_id uuid) TO service_role;


--
-- Name: FUNCTION user_extra_tasks_arr(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_extra_tasks_arr(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_extra_tasks_arr(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_extra_tasks_arr(_user_id uuid) TO service_role;


--
-- Name: FUNCTION user_extra_visible_task_ids(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_extra_visible_task_ids(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_extra_visible_task_ids(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_extra_visible_task_ids(_user_id uuid) TO service_role;


--
-- Name: FUNCTION user_protocol_groups_arr(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_protocol_groups_arr(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_protocol_groups_arr(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_protocol_groups_arr(_user_id uuid) TO service_role;


--
-- Name: FUNCTION user_subordinate_ids(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_subordinate_ids(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_subordinate_ids(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_subordinate_ids(_user_id uuid) TO service_role;


--
-- Name: FUNCTION user_subordinates_arr(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_subordinates_arr(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_subordinates_arr(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_subordinates_arr(_user_id uuid) TO service_role;


--
-- Name: FUNCTION user_visible_department_ids(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_visible_department_ids(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_visible_department_ids(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_visible_department_ids(_user_id uuid) TO service_role;


--
-- Name: FUNCTION user_visible_depts_arr(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_visible_depts_arr(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_visible_depts_arr(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_visible_depts_arr(_user_id uuid) TO service_role;


--
-- Name: FUNCTION user_visible_group_ids(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_visible_group_ids(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_visible_group_ids(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_visible_group_ids(_user_id uuid) TO service_role;


--
-- Name: FUNCTION user_visible_groups_arr(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_visible_groups_arr(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_visible_groups_arr(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_visible_groups_arr(_user_id uuid) TO service_role;


--
-- Name: FUNCTION user_visible_task_ids(_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_visible_task_ids(_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_visible_task_ids(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_visible_task_ids(_user_id uuid) TO service_role;


--
-- Name: FUNCTION validate_source_protocol(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.validate_source_protocol() TO anon;
GRANT ALL ON FUNCTION public.validate_source_protocol() TO authenticated;
GRANT ALL ON FUNCTION public.validate_source_protocol() TO service_role;


--
-- Name: FUNCTION validate_task_group_view_mode(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.validate_task_group_view_mode() TO anon;
GRANT ALL ON FUNCTION public.validate_task_group_view_mode() TO authenticated;
GRANT ALL ON FUNCTION public.validate_task_group_view_mode() TO service_role;


--
-- Name: FUNCTION apply_rls(wal jsonb, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO anon;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO service_role;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO supabase_realtime_admin;


--
-- Name: FUNCTION build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO postgres;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO anon;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO service_role;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO supabase_realtime_admin;


--
-- Name: FUNCTION "cast"(val text, type_ regtype); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO postgres;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO dashboard_user;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO anon;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO authenticated;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO service_role;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO supabase_realtime_admin;


--
-- Name: FUNCTION check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO postgres;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO anon;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO authenticated;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO service_role;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO supabase_realtime_admin;


--
-- Name: FUNCTION is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO postgres;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO anon;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO service_role;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO supabase_realtime_admin;


--
-- Name: FUNCTION list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO anon;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO service_role;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO supabase_realtime_admin;


--
-- Name: FUNCTION quote_wal2json(entity regclass); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO postgres;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO anon;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO authenticated;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO service_role;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO supabase_realtime_admin;


--
-- Name: FUNCTION subscription_check_filters(); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO postgres;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO dashboard_user;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO anon;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO authenticated;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO service_role;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO supabase_realtime_admin;


--
-- Name: FUNCTION to_regrole(role_name text); Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO postgres;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO anon;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO authenticated;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO service_role;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO supabase_realtime_admin;


--
-- Name: FUNCTION topic(); Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON FUNCTION realtime.topic() TO postgres;
GRANT ALL ON FUNCTION realtime.topic() TO dashboard_user;


--
-- Name: FUNCTION _crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION create_secret(new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;


--
-- Name: TABLE audit_log_entries; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.audit_log_entries TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.audit_log_entries TO postgres;
GRANT SELECT ON TABLE auth.audit_log_entries TO postgres WITH GRANT OPTION;


--
-- Name: TABLE custom_oauth_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.custom_oauth_providers TO postgres;
GRANT ALL ON TABLE auth.custom_oauth_providers TO dashboard_user;


--
-- Name: TABLE flow_state; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.flow_state TO postgres;
GRANT SELECT ON TABLE auth.flow_state TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.flow_state TO dashboard_user;


--
-- Name: TABLE identities; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.identities TO postgres;
GRANT SELECT ON TABLE auth.identities TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.identities TO dashboard_user;


--
-- Name: TABLE instances; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.instances TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.instances TO postgres;
GRANT SELECT ON TABLE auth.instances TO postgres WITH GRANT OPTION;


--
-- Name: TABLE mfa_amr_claims; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.mfa_amr_claims TO postgres;
GRANT SELECT ON TABLE auth.mfa_amr_claims TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_amr_claims TO dashboard_user;


--
-- Name: TABLE mfa_challenges; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.mfa_challenges TO postgres;
GRANT SELECT ON TABLE auth.mfa_challenges TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_challenges TO dashboard_user;


--
-- Name: TABLE mfa_factors; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.mfa_factors TO postgres;
GRANT SELECT ON TABLE auth.mfa_factors TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_factors TO dashboard_user;


--
-- Name: TABLE mfa_recovery_code_sets; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.mfa_recovery_code_sets TO postgres;
GRANT ALL ON TABLE auth.mfa_recovery_code_sets TO dashboard_user;


--
-- Name: TABLE mfa_recovery_codes; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.mfa_recovery_codes TO postgres;
GRANT ALL ON TABLE auth.mfa_recovery_codes TO dashboard_user;


--
-- Name: TABLE oauth_authorizations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_authorizations TO postgres;
GRANT ALL ON TABLE auth.oauth_authorizations TO dashboard_user;


--
-- Name: TABLE oauth_client_states; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_client_states TO postgres;
GRANT ALL ON TABLE auth.oauth_client_states TO dashboard_user;


--
-- Name: TABLE oauth_clients; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_clients TO postgres;
GRANT ALL ON TABLE auth.oauth_clients TO dashboard_user;


--
-- Name: TABLE oauth_consents; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.oauth_consents TO postgres;
GRANT ALL ON TABLE auth.oauth_consents TO dashboard_user;


--
-- Name: TABLE one_time_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.one_time_tokens TO postgres;
GRANT SELECT ON TABLE auth.one_time_tokens TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.one_time_tokens TO dashboard_user;


--
-- Name: TABLE refresh_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.refresh_tokens TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.refresh_tokens TO postgres;
GRANT SELECT ON TABLE auth.refresh_tokens TO postgres WITH GRANT OPTION;


--
-- Name: SEQUENCE refresh_tokens_id_seq; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO dashboard_user;
GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO postgres;


--
-- Name: TABLE saml_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.saml_providers TO postgres;
GRANT SELECT ON TABLE auth.saml_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_providers TO dashboard_user;


--
-- Name: TABLE saml_relay_states; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.saml_relay_states TO postgres;
GRANT SELECT ON TABLE auth.saml_relay_states TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_relay_states TO dashboard_user;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.schema_migrations TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.schema_migrations TO postgres;
GRANT SELECT ON TABLE auth.schema_migrations TO postgres WITH GRANT OPTION;


--
-- Name: TABLE scim_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.scim_tokens TO postgres;
GRANT ALL ON TABLE auth.scim_tokens TO dashboard_user;


--
-- Name: TABLE scim_users; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.scim_users TO postgres;
GRANT ALL ON TABLE auth.scim_users TO dashboard_user;


--
-- Name: TABLE sessions; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.sessions TO postgres;
GRANT SELECT ON TABLE auth.sessions TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sessions TO dashboard_user;


--
-- Name: TABLE sso_domains; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.sso_domains TO postgres;
GRANT SELECT ON TABLE auth.sso_domains TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_domains TO dashboard_user;


--
-- Name: TABLE sso_providers; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.sso_providers TO postgres;
GRANT SELECT ON TABLE auth.sso_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_providers TO dashboard_user;


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.users TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE auth.users TO postgres;
GRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;


--
-- Name: TABLE webauthn_challenges; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.webauthn_challenges TO postgres;
GRANT ALL ON TABLE auth.webauthn_challenges TO dashboard_user;


--
-- Name: TABLE webauthn_credentials; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.webauthn_credentials TO postgres;
GRANT ALL ON TABLE auth.webauthn_credentials TO dashboard_user;


--
-- Name: TABLE job; Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT SELECT ON TABLE cron.job TO postgres WITH GRANT OPTION;


--
-- Name: TABLE job_run_details; Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON TABLE cron.job_run_details TO postgres WITH GRANT OPTION;


--
-- Name: TABLE pg_stat_statements; Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON TABLE extensions.pg_stat_statements TO postgres WITH GRANT OPTION;


--
-- Name: TABLE pg_stat_statements_info; Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON TABLE extensions.pg_stat_statements_info TO postgres WITH GRANT OPTION;


--
-- Name: TABLE admin_mode_state; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_mode_state TO anon;
GRANT ALL ON TABLE public.admin_mode_state TO authenticated;
GRANT ALL ON TABLE public.admin_mode_state TO service_role;


--
-- Name: TABLE ai_conversations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_conversations TO anon;
GRANT ALL ON TABLE public.ai_conversations TO authenticated;
GRANT ALL ON TABLE public.ai_conversations TO service_role;


--
-- Name: TABLE calendar_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.calendar_tokens TO anon;
GRANT ALL ON TABLE public.calendar_tokens TO authenticated;
GRANT ALL ON TABLE public.calendar_tokens TO service_role;


--
-- Name: TABLE chat_link_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chat_link_tokens TO anon;
GRANT ALL ON TABLE public.chat_link_tokens TO authenticated;
GRANT ALL ON TABLE public.chat_link_tokens TO service_role;


--
-- Name: TABLE chat_read_status; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chat_read_status TO anon;
GRANT ALL ON TABLE public.chat_read_status TO authenticated;
GRANT ALL ON TABLE public.chat_read_status TO service_role;


--
-- Name: TABLE client_assignments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.client_assignments TO anon;
GRANT ALL ON TABLE public.client_assignments TO authenticated;
GRANT ALL ON TABLE public.client_assignments TO service_role;


--
-- Name: TABLE client_team; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.client_team TO anon;
GRANT ALL ON TABLE public.client_team TO authenticated;
GRANT ALL ON TABLE public.client_team TO service_role;


--
-- Name: TABLE clients; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.clients TO anon;
GRANT ALL ON TABLE public.clients TO authenticated;
GRANT ALL ON TABLE public.clients TO service_role;


--
-- Name: TABLE contractors; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contractors TO anon;
GRANT ALL ON TABLE public.contractors TO authenticated;
GRANT ALL ON TABLE public.contractors TO service_role;


--
-- Name: TABLE dashboard_reports; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.dashboard_reports TO anon;
GRANT ALL ON TABLE public.dashboard_reports TO authenticated;
GRANT ALL ON TABLE public.dashboard_reports TO service_role;


--
-- Name: TABLE decision_clients; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.decision_clients TO anon;
GRANT ALL ON TABLE public.decision_clients TO authenticated;
GRANT ALL ON TABLE public.decision_clients TO service_role;


--
-- Name: TABLE decision_projects; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.decision_projects TO anon;
GRANT ALL ON TABLE public.decision_projects TO authenticated;
GRANT ALL ON TABLE public.decision_projects TO service_role;


--
-- Name: TABLE decision_tags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.decision_tags TO anon;
GRANT ALL ON TABLE public.decision_tags TO authenticated;
GRANT ALL ON TABLE public.decision_tags TO service_role;


--
-- Name: TABLE decision_viewers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.decision_viewers TO anon;
GRANT ALL ON TABLE public.decision_viewers TO authenticated;
GRANT ALL ON TABLE public.decision_viewers TO service_role;


--
-- Name: TABLE decisions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.decisions TO anon;
GRANT ALL ON TABLE public.decisions TO authenticated;
GRANT ALL ON TABLE public.decisions TO service_role;


--
-- Name: TABLE department_directors; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.department_directors TO anon;
GRANT ALL ON TABLE public.department_directors TO authenticated;
GRANT ALL ON TABLE public.department_directors TO service_role;


--
-- Name: TABLE departments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.departments TO anon;
GRANT ALL ON TABLE public.departments TO authenticated;
GRANT ALL ON TABLE public.departments TO service_role;


--
-- Name: TABLE email_send_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.email_send_log TO anon;
GRANT ALL ON TABLE public.email_send_log TO authenticated;
GRANT ALL ON TABLE public.email_send_log TO service_role;


--
-- Name: TABLE email_send_state; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.email_send_state TO anon;
GRANT ALL ON TABLE public.email_send_state TO authenticated;
GRANT ALL ON TABLE public.email_send_state TO service_role;


--
-- Name: TABLE email_unsubscribe_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.email_unsubscribe_tokens TO anon;
GRANT ALL ON TABLE public.email_unsubscribe_tokens TO authenticated;
GRANT ALL ON TABLE public.email_unsubscribe_tokens TO service_role;


--
-- Name: TABLE framework_broadcast_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.framework_broadcast_log TO anon;
GRANT ALL ON TABLE public.framework_broadcast_log TO authenticated;
GRANT ALL ON TABLE public.framework_broadcast_log TO service_role;


--
-- Name: TABLE group_members; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.group_members TO anon;
GRANT ALL ON TABLE public.group_members TO authenticated;
GRANT ALL ON TABLE public.group_members TO service_role;


--
-- Name: TABLE group_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.group_messages TO anon;
GRANT ALL ON TABLE public.group_messages TO authenticated;
GRANT ALL ON TABLE public.group_messages TO service_role;


--
-- Name: TABLE group_report_metrics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.group_report_metrics TO anon;
GRANT ALL ON TABLE public.group_report_metrics TO authenticated;
GRANT ALL ON TABLE public.group_report_metrics TO service_role;


--
-- Name: TABLE group_tags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.group_tags TO anon;
GRANT ALL ON TABLE public.group_tags TO authenticated;
GRANT ALL ON TABLE public.group_tags TO service_role;


--
-- Name: TABLE kanban_boards; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.kanban_boards TO anon;
GRANT ALL ON TABLE public.kanban_boards TO authenticated;
GRANT ALL ON TABLE public.kanban_boards TO service_role;


--
-- Name: TABLE kanban_card_positions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.kanban_card_positions TO anon;
GRANT ALL ON TABLE public.kanban_card_positions TO authenticated;
GRANT ALL ON TABLE public.kanban_card_positions TO service_role;


--
-- Name: TABLE kanban_columns; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.kanban_columns TO anon;
GRANT ALL ON TABLE public.kanban_columns TO authenticated;
GRANT ALL ON TABLE public.kanban_columns TO service_role;


--
-- Name: TABLE km_structure_nodes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.km_structure_nodes TO anon;
GRANT ALL ON TABLE public.km_structure_nodes TO authenticated;
GRANT ALL ON TABLE public.km_structure_nodes TO service_role;


--
-- Name: TABLE max_link_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.max_link_tokens TO anon;
GRANT ALL ON TABLE public.max_link_tokens TO authenticated;
GRANT ALL ON TABLE public.max_link_tokens TO service_role;


--
-- Name: TABLE message_reactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.message_reactions TO anon;
GRANT ALL ON TABLE public.message_reactions TO authenticated;
GRANT ALL ON TABLE public.message_reactions TO service_role;


--
-- Name: TABLE messenger_list_context; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.messenger_list_context TO anon;
GRANT ALL ON TABLE public.messenger_list_context TO authenticated;
GRANT ALL ON TABLE public.messenger_list_context TO service_role;


--
-- Name: TABLE notification_preferences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notification_preferences TO anon;
GRANT ALL ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;


--
-- Name: TABLE npd_card_positions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.npd_card_positions TO anon;
GRANT ALL ON TABLE public.npd_card_positions TO authenticated;
GRANT ALL ON TABLE public.npd_card_positions TO service_role;


--
-- Name: TABLE profile_audit_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profile_audit_log TO anon;
GRANT ALL ON TABLE public.profile_audit_log TO authenticated;
GRANT ALL ON TABLE public.profile_audit_log TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE project_folder_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.project_folder_items TO anon;
GRANT ALL ON TABLE public.project_folder_items TO authenticated;
GRANT ALL ON TABLE public.project_folder_items TO service_role;


--
-- Name: TABLE project_folders; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.project_folders TO anon;
GRANT ALL ON TABLE public.project_folders TO authenticated;
GRANT ALL ON TABLE public.project_folders TO service_role;


--
-- Name: TABLE project_milestones; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.project_milestones TO anon;
GRANT ALL ON TABLE public.project_milestones TO authenticated;
GRANT ALL ON TABLE public.project_milestones TO service_role;


--
-- Name: TABLE protocol_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.protocol_templates TO anon;
GRANT ALL ON TABLE public.protocol_templates TO authenticated;
GRANT ALL ON TABLE public.protocol_templates TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.push_subscriptions TO anon;
GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE report_pages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.report_pages TO anon;
GRANT ALL ON TABLE public.report_pages TO authenticated;
GRANT ALL ON TABLE public.report_pages TO service_role;


--
-- Name: TABLE shared_pages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.shared_pages TO anon;
GRANT ALL ON TABLE public.shared_pages TO authenticated;
GRANT ALL ON TABLE public.shared_pages TO service_role;


--
-- Name: TABLE shared_pages_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.shared_pages_history TO anon;
GRANT ALL ON TABLE public.shared_pages_history TO authenticated;
GRANT ALL ON TABLE public.shared_pages_history TO service_role;


--
-- Name: SEQUENCE shared_pages_history_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.shared_pages_history_id_seq TO anon;
GRANT ALL ON SEQUENCE public.shared_pages_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.shared_pages_history_id_seq TO service_role;


--
-- Name: TABLE stm_structure_nodes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.stm_structure_nodes TO anon;
GRANT ALL ON TABLE public.stm_structure_nodes TO authenticated;
GRANT ALL ON TABLE public.stm_structure_nodes TO service_role;


--
-- Name: TABLE subtasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.subtasks TO anon;
GRANT ALL ON TABLE public.subtasks TO authenticated;
GRANT ALL ON TABLE public.subtasks TO service_role;


--
-- Name: TABLE suppressed_emails; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.suppressed_emails TO anon;
GRANT ALL ON TABLE public.suppressed_emails TO authenticated;
GRANT ALL ON TABLE public.suppressed_emails TO service_role;


--
-- Name: TABLE tag_access; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tag_access TO anon;
GRANT ALL ON TABLE public.tag_access TO authenticated;
GRANT ALL ON TABLE public.tag_access TO service_role;


--
-- Name: TABLE tag_categories; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tag_categories TO anon;
GRANT ALL ON TABLE public.tag_categories TO authenticated;
GRANT ALL ON TABLE public.tag_categories TO service_role;


--
-- Name: TABLE tags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tags TO anon;
GRANT ALL ON TABLE public.tags TO authenticated;
GRANT ALL ON TABLE public.tags TO service_role;


--
-- Name: TABLE task_comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_comments TO anon;
GRANT ALL ON TABLE public.task_comments TO authenticated;
GRANT ALL ON TABLE public.task_comments TO service_role;


--
-- Name: TABLE task_dependencies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_dependencies TO anon;
GRANT ALL ON TABLE public.task_dependencies TO authenticated;
GRANT ALL ON TABLE public.task_dependencies TO service_role;


--
-- Name: TABLE task_group_linked_tags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_group_linked_tags TO anon;
GRANT ALL ON TABLE public.task_group_linked_tags TO authenticated;
GRANT ALL ON TABLE public.task_group_linked_tags TO service_role;


--
-- Name: TABLE task_groups; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_groups TO anon;
GRANT ALL ON TABLE public.task_groups TO authenticated;
GRANT ALL ON TABLE public.task_groups TO service_role;


--
-- Name: TABLE task_participants; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_participants TO anon;
GRANT ALL ON TABLE public.task_participants TO authenticated;
GRANT ALL ON TABLE public.task_participants TO service_role;


--
-- Name: TABLE task_step_templates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_step_templates TO anon;
GRANT ALL ON TABLE public.task_step_templates TO authenticated;
GRANT ALL ON TABLE public.task_step_templates TO service_role;


--
-- Name: TABLE task_tags; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.task_tags TO anon;
GRANT ALL ON TABLE public.task_tags TO authenticated;
GRANT ALL ON TABLE public.task_tags TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: TABLE team_members; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.team_members TO anon;
GRANT ALL ON TABLE public.team_members TO authenticated;
GRANT ALL ON TABLE public.team_members TO service_role;


--
-- Name: TABLE teams; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.teams TO anon;
GRANT ALL ON TABLE public.teams TO authenticated;
GRANT ALL ON TABLE public.teams TO service_role;


--
-- Name: TABLE telegram_2fa_codes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.telegram_2fa_codes TO anon;
GRANT ALL ON TABLE public.telegram_2fa_codes TO authenticated;
GRANT ALL ON TABLE public.telegram_2fa_codes TO service_role;


--
-- Name: TABLE telegram_bot_chats; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.telegram_bot_chats TO anon;
GRANT ALL ON TABLE public.telegram_bot_chats TO authenticated;
GRANT ALL ON TABLE public.telegram_bot_chats TO service_role;


--
-- Name: TABLE telegram_group_chats; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.telegram_group_chats TO anon;
GRANT ALL ON TABLE public.telegram_group_chats TO authenticated;
GRANT ALL ON TABLE public.telegram_group_chats TO service_role;


--
-- Name: TABLE telegram_pending_context; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.telegram_pending_context TO anon;
GRANT ALL ON TABLE public.telegram_pending_context TO authenticated;
GRANT ALL ON TABLE public.telegram_pending_context TO service_role;


--
-- Name: SEQUENCE telegram_pending_context_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.telegram_pending_context_id_seq TO anon;
GRANT ALL ON SEQUENCE public.telegram_pending_context_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.telegram_pending_context_id_seq TO service_role;


--
-- Name: TABLE user_departments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_departments TO anon;
GRANT ALL ON TABLE public.user_departments TO authenticated;
GRANT ALL ON TABLE public.user_departments TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE user_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_settings TO anon;
GRANT ALL ON TABLE public.user_settings TO authenticated;
GRANT ALL ON TABLE public.user_settings TO service_role;


--
-- Name: TABLE vapid_keys; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vapid_keys TO anon;
GRANT ALL ON TABLE public.vapid_keys TO authenticated;
GRANT ALL ON TABLE public.vapid_keys TO service_role;


--
-- Name: TABLE vapid_public_keys; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vapid_public_keys TO anon;
GRANT ALL ON TABLE public.vapid_public_keys TO authenticated;
GRANT ALL ON TABLE public.vapid_public_keys TO service_role;


--
-- Name: TABLE weekly_send_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.weekly_send_log TO anon;
GRANT ALL ON TABLE public.weekly_send_log TO authenticated;
GRANT ALL ON TABLE public.weekly_send_log TO service_role;


--
-- Name: TABLE wiki_pages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.wiki_pages TO anon;
GRANT ALL ON TABLE public.wiki_pages TO authenticated;
GRANT ALL ON TABLE public.wiki_pages TO service_role;


--
-- Name: TABLE wiki_structured_sections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.wiki_structured_sections TO anon;
GRANT ALL ON TABLE public.wiki_structured_sections TO authenticated;
GRANT ALL ON TABLE public.wiki_structured_sections TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON TABLE realtime.messages TO postgres;
GRANT ALL ON TABLE realtime.messages TO dashboard_user;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO anon;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO service_role;


--
-- Name: SEQUENCE messages_id_seq; Type: ACL; Schema: realtime; Owner: supabase_realtime_admin
--

GRANT ALL ON SEQUENCE realtime.messages_id_seq TO postgres;
GRANT ALL ON SEQUENCE realtime.messages_id_seq TO dashboard_user;
GRANT USAGE ON SEQUENCE realtime.messages_id_seq TO anon;
GRANT USAGE ON SEQUENCE realtime.messages_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE realtime.messages_id_seq TO service_role;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.schema_migrations TO postgres;
GRANT ALL ON TABLE realtime.schema_migrations TO dashboard_user;
GRANT SELECT ON TABLE realtime.schema_migrations TO anon;
GRANT SELECT ON TABLE realtime.schema_migrations TO authenticated;
GRANT SELECT ON TABLE realtime.schema_migrations TO service_role;
GRANT ALL ON TABLE realtime.schema_migrations TO supabase_realtime_admin;


--
-- Name: TABLE subscription; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON TABLE realtime.subscription TO postgres;
GRANT ALL ON TABLE realtime.subscription TO dashboard_user;
GRANT SELECT ON TABLE realtime.subscription TO anon;
GRANT SELECT ON TABLE realtime.subscription TO authenticated;
GRANT SELECT ON TABLE realtime.subscription TO service_role;
GRANT ALL ON TABLE realtime.subscription TO supabase_realtime_admin;


--
-- Name: SEQUENCE subscription_id_seq; Type: ACL; Schema: realtime; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO postgres;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO dashboard_user;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO anon;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO service_role;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO supabase_realtime_admin;


--
-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.buckets TO anon;
GRANT ALL ON TABLE storage.buckets TO authenticated;
GRANT ALL ON TABLE storage.buckets TO service_role;
GRANT ALL ON TABLE storage.buckets TO postgres;


--
-- Name: TABLE migrations; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.migrations TO anon;
GRANT ALL ON TABLE storage.migrations TO authenticated;
GRANT ALL ON TABLE storage.migrations TO service_role;
GRANT ALL ON TABLE storage.migrations TO postgres;


--
-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.objects TO authenticated;
GRANT ALL ON TABLE storage.objects TO service_role;
GRANT ALL ON TABLE storage.objects TO postgres;


--
-- Name: TABLE s3_multipart_uploads; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.s3_multipart_uploads TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO anon;


--
-- Name: TABLE s3_multipart_uploads_parts; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.s3_multipart_uploads_parts TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO anon;


--
-- Name: TABLE secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,DELETE ON TABLE vault.secrets TO postgres WITH GRANT OPTION;


--
-- Name: TABLE decrypted_secrets; Type: ACL; Schema: vault; Owner: supabase_admin
--

GRANT SELECT,DELETE ON TABLE vault.decrypted_secrets TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: cron; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA cron GRANT ALL ON SEQUENCES  TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: cron; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA cron GRANT ALL ON FUNCTIONS  TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: cron; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA cron GRANT ALL ON TABLES  TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON SEQUENCES  TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON FUNCTIONS  TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON TABLES  TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: pgmq; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgmq GRANT SELECT ON SEQUENCES  TO pg_monitor;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: pgmq; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgmq GRANT SELECT ON TABLES  TO pg_monitor;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES  TO service_role;


--
-- PostgreSQL database dump complete
--


