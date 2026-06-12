/**
 * Launch feature flags. Flip these as the product matures — the code behind
 * a hidden feature stays in place so it can be relaunched without a rewrite.
 */
export const FLAGS = {
  /**
   * Show the forum tab in the main navigation. Hidden for launch: an empty
   * forum signals a dead app. The home page "siste funn" feed is unaffected,
   * and /forum stays reachable by URL for early users.
   */
  forumInNav: false,
  /**
   * Sopptur mode (the map trip log + home page last-trip card). Hidden for
   * launch: it only persists to localStorage and is lost on device switch —
   * rebuild on DB + GPS track before relaunching it as a feature.
   */
  tripMode: false
} as const;
