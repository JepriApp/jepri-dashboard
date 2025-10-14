export const CustomerRoles = ["admin", "vendor", "customer"] as const;
export type CustomerRoleType = typeof CustomerRoles;

export interface BaseAttributes {
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt?: Date;
  deletedAt?: Date;
}
export type Response<T> =
  | {
      status: "Success";
      data: T;
      error: null;
    }
  | {
      status: "Error";
      data: null;
      error: {
        message?: string;
        detail?: string;
      };
    };
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    lastPage: number;
    limit: number;
    page: number;
    total: number;
  };
}