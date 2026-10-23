/**
 * Where "open this project" goes (BIG-5).
 *
 * On its own a project card opens its project as the page. Inside one of two
 * boards side by side it must open in THAT board, keeping the other one — a
 * mega project's cards sit on its board, and tapping one used to throw the
 * whole split away. The board provides the answer; a card anywhere else gets
 * the ordinary navigation.
 */
import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

export const OpenProjectContext = createContext<((projectId: string) => void) | null>(null);

export function useOpenProject(): (projectId: string) => void {
  const inPane = useContext(OpenProjectContext);
  const navigate = useNavigate();
  return inPane ?? ((projectId) => navigate(`/project/${projectId}`));
}
