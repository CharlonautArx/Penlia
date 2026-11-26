import { router, useLocalSearchParams, usePathname, type Href } from 'expo-router';

export function useTogether() {
  const path = usePathname();
  const { together } = useLocalSearchParams();
  return path === '/life' || together === '1';
}

export function inside(href: Href): Href {
  const target = typeof href === 'string' ? { pathname: href } : href;
  if (
    !/^\/(?:social$|playground\/with-friends$|gathering\/|collection\/|journal-entry\/|world(?:\/|$)|life\/(?:calendar|items|projects|project\/|memories|reminders|capsule-drafts))/.test(
      target.pathname,
    )
  )
    return href;
  return { ...target, params: { ...('params' in target ? target.params : {}), together: '1' } } as Href;
}

export function useTogetherRouter() {
  const active = useTogether();
  return active
    ? {
        ...router,
        push: (href: Href) => router.push(inside(href)),
        replace: (href: Href) => router.replace(inside(href)),
      }
    : router;
}
