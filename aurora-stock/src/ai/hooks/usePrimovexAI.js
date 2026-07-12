import { useContext } from 'react';
import { PrimovexAIContext } from '../context/PrimovexAIContext';

export default function usePrimovexAI() {
  const context = useContext(PrimovexAIContext);
  if (!context) throw new Error('usePrimovexAI must be used inside PrimovexAIProvider.');
  return context;
}
