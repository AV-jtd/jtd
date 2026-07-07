UPDATE public.tasks
  SET client_id = '553d5502-1217-443e-927b-5b3a03407db0'
  WHERE client_id = 'e295f25a-55c4-4e70-acc3-255e24cd0be9';
DELETE FROM public.clients WHERE id = 'e295f25a-55c4-4e70-acc3-255e24cd0be9';