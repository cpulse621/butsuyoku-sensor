// Phase 1 共通エラー型。
// 「未確定値を推測で補完しない」という制約を、コード上でも強制するために使う。
// データが足りない箇所は、黙って0やnull扱いにするのではなく、必ずこれらの例外を投げる。

export class MissingPoolDataError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "MissingPoolDataError";
    this.details = details;
  }
}

export class InvalidTargetError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "InvalidTargetError";
    this.details = details;
  }
}

export class InvalidDatasetError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "InvalidDatasetError";
    this.details = details;
  }
}
