import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import { useEffect, useState } from 'react';

interface MyEditorComponentProps {
  initialData?: string;
  onDataChange?: (data: string) => void;
}

const MyEditorComponent: React.FC<MyEditorComponentProps> = ({ initialData = '<p>Привет, мир!</p>', onDataChange }) => {
    const [editorData, setEditorData] = useState(initialData);

    useEffect(() => {
        setEditorData(initialData);
    }, [initialData]);

    return (
      <div style={{ border: '1px solid #ccc', borderRadius: '4px' }}>
        <CKEditor
          editor={ ClassicEditor as any }
          data={editorData}
          onReady={ editor => {
            console.log( 'Editor is ready to use!', editor );
          } }
          onChange={ ( event, editor ) => {
            const data = editor.getData();
            console.log( { event, editor, data } );
            setEditorData( data );
            onDataChange?.(data);
          } }
          onBlur={ ( event, editor ) => {
            console.log( 'Blur.', editor );
          } }
          onFocus={ ( event, editor ) => {
            console.log( 'Focus.', editor );
          } }
          config={ {
          } }
        />
      </div>
    );
};

export default MyEditorComponent;