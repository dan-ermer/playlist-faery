// Thrown for problems retrying won't fix (post deleted, not a music list,
// unsupported link...). The post is marked failed straight away.
export class PermanentError extends Error {}

// Thrown when a step can't run until Dan fixes something outside the post
// (e.g. the Spotify login expired). The post keeps its status and the error
// message, and the attempt doesn't count toward the retry limit.
export class WaitError extends Error {}
