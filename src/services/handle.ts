export function formatHandle(username: string) {
  return username.trim().replace(/^[@＠]+/, '');
}
