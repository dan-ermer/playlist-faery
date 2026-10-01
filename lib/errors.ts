// Thrown for problems retrying won't fix (post deleted, not a music list,
// unsupported link...). The post is marked failed straight away.
export class PermanentError extends Error {}
