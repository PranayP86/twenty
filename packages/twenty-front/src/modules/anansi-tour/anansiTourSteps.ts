// ANANSI PATCH (WS-C): ordered guided-tour stops. Selectors are resolved only
// when a stop is shown so route changes and late-rendered dashboard widgets are
// handled without retaining stale DOM nodes.
export type AnansiTourStep = {
  selector: string;
  route?: string;
  routeSelector?: string;
  title: string;
  body: string;
};

export const ANANSI_TOUR_STEPS: AnansiTourStep[] = [
  {
    selector: '[id^="nav-item-anansi"]',
    routeSelector: '[id^="nav-item-anansi"]',
    title: 'Your dashboard',
    body: 'Everything that needs your attention lands here first.',
  },
  {
    selector: '[data-anansi-tour="widget-card"]',
    routeSelector: '[id^="nav-item-anansi"]',
    title: 'Live cards',
    body: 'Each card is live: pipeline, activity, sends, and the tasks waiting on you.',
  },
  {
    selector: '[data-anansi-tour="autonomy-toggle"]',
    route: '/profile',
    title: 'Autonomy switches',
    body: 'Start with everything on ask-first. Flip a switch when you trust Anansi with that category.',
  },
  {
    selector: '[id^="nav-item-jobs"]',
    title: 'Jobs',
    body: 'Postings Anansi finds (and ones you add) live here.',
  },
];
