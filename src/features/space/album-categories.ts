import type { SpaceDocument } from './model';

export type AlbumCategory = { id: string; ownerId: string; name: string; description: string };

export function editCategory(data: SpaceDocument, owner: string, category: AlbumCategory) {
  const name = category.name.trim();
  const groups = data.categories ?? [];
  if (category.ownerId !== owner || !name || name === '全部' || name.length > 30 || category.description.length > 160)
    throw new Error('请输入有效的分类名称和简介。');
  if (groups.some(item => item.id !== category.id && item.ownerId === owner && item.name === name))
    throw new Error('已存在同名分类。');
  const previous = groups.find(item => item.id === category.id);
  if (previous && previous.ownerId !== owner) throw new Error('无法修改此分类。');
  const next = { ...category, name, description: category.description.trim() };
  return { ...data, categories: previous ? groups.map(item => item.id === next.id ? next : item) : [...groups, next] };
}
export function removeCategory(data: SpaceDocument, owner: string, id: string) {
  return { ...data, categories: (data.categories ?? []).filter(item => item.id !== id || item.ownerId !== owner),
    albums: data.albums.map(album => album.ownerId === owner && album.categoryId === id ? { ...album, categoryId: undefined } : album) };
}
export function assignCategory(data: SpaceDocument, owner: string, albumId: string, categoryId?: string) {
  if (categoryId && !data.categories?.some(item => item.id === categoryId && item.ownerId === owner))
    throw new Error('此分类已不可用。');
  return { ...data, albums: data.albums.map(item => item.id === albumId && item.ownerId === owner ? { ...item, categoryId } : item) };
}
