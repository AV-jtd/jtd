-- Супер-права админа: полный доступ ко всем рабочим таблицам
-- Использует существующую функцию public.has_role(uid, 'admin')

-- 1. tasks
CREATE POLICY "Admins full access to tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. subtasks
CREATE POLICY "Admins full access to subtasks" ON public.subtasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. task_dependencies (Гантт)
CREATE POLICY "Admins full access to dependencies" ON public.task_dependencies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. task_participants
CREATE POLICY "Admins full access to task participants" ON public.task_participants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. task_tags
CREATE POLICY "Admins full access to task tags" ON public.task_tags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. task_comments
CREATE POLICY "Admins full access to task comments" ON public.task_comments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. task_groups (проекты)
CREATE POLICY "Admins full access to task groups" ON public.task_groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. project_milestones
CREATE POLICY "Admins full access to milestones" ON public.project_milestones
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9. project_folders
CREATE POLICY "Admins full access to project folders" ON public.project_folders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 10. project_folder_items
CREATE POLICY "Admins full access to folder items" ON public.project_folder_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 11. clients (CRM)
CREATE POLICY "Admins full access to clients" ON public.clients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 12. tags
CREATE POLICY "Admins full access to tags" ON public.tags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 13. tag_categories
CREATE POLICY "Admins full access to tag categories" ON public.tag_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 14. group_members
CREATE POLICY "Admins full access to group members" ON public.group_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 15. group_messages
CREATE POLICY "Admins full access to group messages" ON public.group_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 16. wiki_pages
CREATE POLICY "Admins full access to wiki pages" ON public.wiki_pages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 17. wiki_structured_sections
CREATE POLICY "Admins full access to wiki sections" ON public.wiki_structured_sections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 18. report_pages
CREATE POLICY "Admins full access to reports" ON public.report_pages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 19. task_step_templates
CREATE POLICY "Admins full access to step templates" ON public.task_step_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 20. protocol_templates
CREATE POLICY "Admins full access to protocol templates" ON public.protocol_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 21. group_tags
CREATE POLICY "Admins full access to group tags" ON public.group_tags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 22. tag_access
CREATE POLICY "Admins full access to tag access" ON public.tag_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 23. npd_card_positions
CREATE POLICY "Admins full access to npd positions" ON public.npd_card_positions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));