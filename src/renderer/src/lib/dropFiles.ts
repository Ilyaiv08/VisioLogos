export const hasFiles = (e: React.DragEvent): boolean =>
  Array.from(e.dataTransfer.types).includes('Files')

export async function droppedPaths(e: React.DragEvent): Promise<string[]> {
  const paths = Array.from(e.dataTransfer.files)
    .map((file) => window.api.files.pathFor(file))
    .filter(Boolean)

  return paths.length > 0 ? window.api.files.expand(paths) : []
}
