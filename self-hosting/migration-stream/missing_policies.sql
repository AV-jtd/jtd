CREATE POLICY "Consultant block on clients" ON public.clients AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Group members can view group clients" ON public.clients AS PERMISSIVE FOR SELECT TO public
  USING (((group_id IS NOT NULL) AND is_group_member(group_id, auth.uid())));
CREATE POLICY "Group owners can view group clients" ON public.clients AS PERMISSIVE FOR SELECT TO public
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
CREATE POLICY "Consultants view own contractor" ON public.contractors AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_consultant(auth.uid()) AND (id = consultant_company(auth.uid()))));
CREATE POLICY "Consultant block on dashboard_reports" ON public.dashboard_reports AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant block on group_members" ON public.group_members AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant block on group_messages" ON public.group_messages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant block on group_tags" ON public.group_tags AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant restriction on reactions" ON public.message_reactions AS RESTRICTIVE FOR ALL TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR ((message_type = 'task_comment'::text) AND (EXISTS ( SELECT 1
   FROM task_comments tc
  WHERE ((tc.id = message_reactions.message_id) AND consultant_can_see_task(auth.uid(), tc.task_id)))))))
  WITH CHECK (((NOT is_consultant(auth.uid())) OR ((user_id = auth.uid()) AND (message_type = 'task_comment'::text) AND (EXISTS ( SELECT 1
   FROM task_comments tc
  WHERE ((tc.id = message_reactions.message_id) AND consultant_can_see_task(auth.uid(), tc.task_id)))))));
CREATE POLICY "Consultant block on npd_card_positions" ON public.npd_card_positions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users can view profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_profile(id));
CREATE POLICY "Consultant block on project_folder_items" ON public.project_folder_items AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant block on project_folders" ON public.project_folders AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant block on project_milestones" ON public.project_milestones AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant block on protocol_templates" ON public.protocol_templates AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant block on report_pages" ON public.report_pages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant restriction on subtasks" ON public.subtasks AS RESTRICTIVE FOR ALL TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id)))
  WITH CHECK (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id)));
CREATE POLICY "Internal attendees can delete draft protocol subtasks" ON public.subtasks AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_task_in_protocol_attendee_scope(task_id, auth.uid(), true));
CREATE POLICY "Internal attendees can edit draft protocol subtasks" ON public.subtasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_task_in_protocol_attendee_scope(task_id, auth.uid(), true));
CREATE POLICY "Internal attendees can insert draft protocol subtasks" ON public.subtasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_task_in_protocol_attendee_scope(task_id, auth.uid(), true));
CREATE POLICY "Internal attendees can update published protocol subtasks" ON public.subtasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_task_in_protocol_attendee_scope(task_id, auth.uid(), false))
  WITH CHECK (is_task_in_protocol_attendee_scope(task_id, auth.uid(), false));
CREATE POLICY "Consultants view own/visible tags" ON public.tags AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_consultant(auth.uid()) AND ((user_id = auth.uid()) OR consultant_can_see_tag(auth.uid(), id))));
CREATE POLICY "Consultant restriction on comments" ON public.task_comments AS RESTRICTIVE FOR ALL TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id)))
  WITH CHECK (((NOT is_consultant(auth.uid())) OR ((auth.uid() = user_id) AND consultant_can_see_task(auth.uid(), task_id))));
CREATE POLICY "Internal attendees can comment on protocol tasks" ON public.task_comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = user_id) AND is_task_in_protocol_attendee_scope(task_id, auth.uid(), false)));
CREATE POLICY "Internal attendees can view protocol task comments" ON public.task_comments AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_task_in_protocol_attendee_scope(task_id, auth.uid(), false));
CREATE POLICY "Consultant restriction on dependencies" ON public.task_dependencies AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR (((predecessor_entity_type <> 'task'::text) OR consultant_can_see_task(auth.uid(), predecessor_id)) AND ((successor_entity_type <> 'task'::text) OR consultant_can_see_task(auth.uid(), successor_id)) AND (predecessor_entity_type = 'task'::text) AND (successor_entity_type = 'task'::text))));
CREATE POLICY "Consultant restriction on groups" ON public.task_groups AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_group(auth.uid(), id) OR (user_id = auth.uid())));
CREATE POLICY "Internal attendees can edit protocol draft" ON public.task_groups AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_protocol_internal_attendee(id, auth.uid()) AND (draft_status = 'draft'::text)))
  WITH CHECK (is_protocol_internal_attendee(id, auth.uid()));
CREATE POLICY "Internal attendees can view protocol" ON public.task_groups AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_protocol_internal_attendee(id, auth.uid()));
CREATE POLICY "Consultant restriction on participants" ON public.task_participants AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id)));
CREATE POLICY "Group members can view group templates" ON public.task_step_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NOT NULL) AND is_group_member(group_id, auth.uid())));
CREATE POLICY "Group owners can view group templates" ON public.task_step_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NOT NULL) AND is_group_owner(group_id, auth.uid())));
CREATE POLICY "Users can view global templates" ON public.task_step_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_global = true));
CREATE POLICY "Users manage own templates" ON public.task_step_templates AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Consultant restriction on task_tags" ON public.task_tags AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), task_id)));
CREATE POLICY "Consultant restriction on tasks" ON public.tasks AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), id)));
CREATE POLICY "Consultant restriction on tasks update" ON public.tasks AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (((NOT is_consultant(auth.uid())) OR consultant_can_see_task(auth.uid(), id)));
CREATE POLICY "Internal attendees can delete draft protocol tasks" ON public.tasks AS PERMISSIVE FOR DELETE TO authenticated
  USING (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid()) AND is_protocol_draft(group_id)));
CREATE POLICY "Internal attendees can edit draft protocol tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid()) AND is_protocol_draft(group_id)))
  WITH CHECK (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid())));
CREATE POLICY "Internal attendees can insert draft protocol tasks" ON public.tasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid()) AND is_protocol_draft(group_id) AND (user_id = auth.uid())));
CREATE POLICY "Internal attendees can update published protocol tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid())))
  WITH CHECK (((group_id IS NOT NULL) AND is_protocol_internal_attendee(group_id, auth.uid())));
CREATE POLICY "Consultant block on team_members" ON public.team_members AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant block on teams" ON public.teams AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Consultant block on wiki_pages" ON public.wiki_pages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
CREATE POLICY "Users can create personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((group_id IS NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can delete personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR DELETE TO authenticated
  USING (((group_id IS NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can update personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((group_id IS NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Users can view personal wiki pages" ON public.wiki_pages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((group_id IS NULL) AND (auth.uid() = user_id)));
CREATE POLICY "Consultant block on wiki_structured_sections" ON public.wiki_structured_sections AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT is_consultant(auth.uid())))
  WITH CHECK ((NOT is_consultant(auth.uid())));
