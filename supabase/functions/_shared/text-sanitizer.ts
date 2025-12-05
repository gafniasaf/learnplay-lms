type Sanitizable = string | null | undefined;

function normalizeMojibake(input: Sanitizable): string {
  if (input === undefined || input === null) return '';
  let text = String(input);

  const replacements: Array<[RegExp, string]> = [
    [/A\?/g, '×'],
    [/A�/g, '°'],
    [/10�\?/g, '10^8'],
    [/�\?/g, '^'],
    [/×10\^([^\d]|$)/g, '×10^8$1']
  ];

  for (const [pattern, value] of replacements) {
    text = text.replace(pattern, value);
  }

  return text;
}

function sanitizeItem(item: Record<string, unknown>): void {
  if (typeof item.text === 'string') {
    item.text = normalizeMojibake(item.text);
  }

  if (Array.isArray(item.options)) {
    item.options = item.options.map(option =>
      typeof option === 'string' ? normalizeMojibake(option) : option
    );
  }
}

function sanitizeStudyText(studyText: Record<string, unknown>): void {
  if (typeof studyText.content === 'string') {
    studyText.content = normalizeMojibake(studyText.content);
  }
  if (typeof studyText.title === 'string') {
    studyText.title = normalizeMojibake(studyText.title);
  }
}

export function sanitizeCourseContent<T extends Record<string, unknown>>(course: T): T {
  if ('title' in course && typeof course.title === 'string') {
    (course as any).title = normalizeMojibake(course.title);
  }
  if ('description' in course && typeof course.description === 'string') {
    (course as any).description = normalizeMojibake(course.description);
  }

  if (Array.isArray(course.items)) {
    course.items.forEach(item => {
      if (item && typeof item === 'object') {
        sanitizeItem(item as Record<string, unknown>);
      }
    });
  }

  if (Array.isArray(course.studyTexts)) {
    course.studyTexts.forEach(studyText => {
      if (studyText && typeof studyText === 'object') {
        sanitizeStudyText(studyText as Record<string, unknown>);
      }
    });
  }

  return course;
}

