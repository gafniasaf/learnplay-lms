import CourseSelector from "./CourseSelector";

export default function WysiwygExerciseEditorSelector() {
  return (
    <CourseSelector
      editorBasePath="/admin/wysiwyg-exercise-editor"
      title="Select Course to Edit"
      description="Choose a course to open in the Wysiwyg exercise editor"
      editLabel="Open"
    />
  );
}


