/**
 * Cache tags for the data layer.
 *
 * One module so a tag is never spelled two different ways in two files — a typo'd tag
 * fails silently, leaving stale content on the public site with nothing in the logs.
 */
export const TAGS = {
  menu: 'menu',
  business: 'business',
  content: 'content',
  theme: 'theme',
} as const;

export type CacheTag = (typeof TAGS)[keyof typeof TAGS];
