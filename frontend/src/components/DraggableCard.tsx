// components/DraggableCard.tsx
import React from 'react';
import { useDraggable } from '@dnd-kit/core';

export const DraggableCard = ({ id, children, position }: any) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : {};

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
};