import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gswoglqqilkhwuedgktp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzd29nbHFxaWxraHd1ZWRna3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3NjczNTQsImV4cCI6MjA3NTM0MzM1NH0.nwVG6-b810tpqDZri5L-KAouqsBvHw0CBxlnOyt2Oz8';

export const supabase = createClient(supabaseUrl, supabaseKey);