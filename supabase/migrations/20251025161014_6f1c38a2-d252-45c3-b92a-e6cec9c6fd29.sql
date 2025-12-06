-- Seed global tags data
INSERT INTO tag_types (organization_id, key, label, is_enabled, display_order) VALUES
  (NULL, 'domain', 'Domain', true, 0),
  (NULL, 'level', 'Level', true, 1),
  (NULL, 'theme', 'Theme', true, 2),
  (NULL, 'subject', 'Subject', true, 3),
  (NULL, 'class', 'Class', true, 4)
ON CONFLICT DO NOTHING;

INSERT INTO tags (organization_id, type_key, value, slug, is_active) VALUES
  (NULL, 'domain', 'Mathematics', 'mathematics', true),
  (NULL, 'domain', 'Science', 'science', true),
  (NULL, 'domain', 'Language Arts', 'language-arts', true),
  (NULL, 'domain', 'Social Studies', 'social-studies', true),
  (NULL, 'domain', 'Computer Science', 'computer-science', true),
  (NULL, 'domain', 'Medicine', 'medicine', true),
  (NULL, 'level', 'Kindergarten', 'kindergarten', true),
  (NULL, 'level', 'Elementary', 'elementary', true),
  (NULL, 'level', 'Middle School', 'middle-school', true),
  (NULL, 'level', 'High School', 'high-school', true),
  (NULL, 'level', 'University', 'university', true),
  (NULL, 'level', 'Professional', 'professional', true),
  (NULL, 'theme', 'Numbers', 'numbers', true),
  (NULL, 'theme', 'Time', 'time', true),
  (NULL, 'theme', 'Anatomy', 'anatomy', true),
  (NULL, 'theme', 'Grammar', 'grammar', true)
ON CONFLICT DO NOTHING;