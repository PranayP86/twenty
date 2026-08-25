import { getLinkNavigationMenuItemComputedLink } from '@/navigation-menu-item/display/link/utils/getLinkNavigationMenuItemComputedLink';

describe('getLinkNavigationMenuItemComputedLink', () => {
  it('returns a relative route for a same-origin absolute link', () => {
    expect(
      getLinkNavigationMenuItemComputedLink({
        link: `${window.location.origin}/profile?section=autonomy#controls`,
      }),
    ).toBe('/profile?section=autonomy#controls');
  });

  it('keeps an external absolute link unchanged', () => {
    expect(
      getLinkNavigationMenuItemComputedLink({
        link: 'https://docs.example.com/profile',
      }),
    ).toBe('https://docs.example.com/profile');
  });
});
