// src/lib/queries/index.ts

export { getDailyActivityData } from './activityQueries';
export { getUserProfilesByIds } from './userQueries';
export {
  getBulkVariantSizes,
  getBulkInventoryCounts,
  getBulkWishlistCounts,
} from './variantQueries';

// Waterfall queries for Layer 5
export {
  getNewUsersInWindow,
  checkUsersClosetCompletion,
  checkUsersBioCompletion,
  checkUsersOfferCompletion,
  checkUsersWishlistCompletion,
} from './waterfallQueries';
export type { NewUser } from './waterfallQueries';

// Target shoe queries for waterfall enrichment
export { getTopTargetShoeForUsers } from './targetShoeQueries';
export type { TargetShoeResult } from './targetShoeQueries';
