import { type NavigationMenuItem } from '~/generated-metadata/graphql';

export const getLinkNavigationMenuItemComputedLink = (
  item: Pick<NavigationMenuItem, 'link'>,
): string => {
  const linkUrl = (item.link ?? '').trim();
  if (!linkUrl) {
    return '';
  }

  const computedLink =
    linkUrl.startsWith('http://') || linkUrl.startsWith('https://')
      ? linkUrl
      : `https://${linkUrl}`;

  if (typeof window === 'undefined') {
    return computedLink;
  }

  try {
    const url = new URL(computedLink);

    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : computedLink;
  } catch {
    return computedLink;
  }
};
