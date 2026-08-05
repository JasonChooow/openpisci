import React from 'react';
import { Navigate } from 'react-router-dom';

/** Legacy /model path → portal model catalog (DimRouter), not empty New API. */
export default function ModelPage() {
  return <Navigate to="/models" replace />;
}
