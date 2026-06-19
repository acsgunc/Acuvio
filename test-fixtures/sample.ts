interface User { id: number; name: string; }
export function greet(u: User): string {
  // line comment
  return `Hello, ${u.name}!`;
}
