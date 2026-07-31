import { claimRouteContracts } from "./claims.contract";
import type { ApiRouteContract } from "./contract";
import { deviceRouteContracts } from "./devices.contract";
import { documentRouteContracts } from "./documents.contract";
import { identityRouteContracts } from "./identity.contract";
import { imageRouteContracts } from "./images.contract";
import { productRouteContracts } from "./products.contract";
import { recordRouteContracts } from "./records.contract";

export type { ApiRouteContract, SchemaName } from "./contract";

export const apiRouteContracts: ApiRouteContract[] = [
  ...deviceRouteContracts,
  ...identityRouteContracts,
  ...recordRouteContracts,
  ...productRouteContracts,
  ...imageRouteContracts,
  ...documentRouteContracts,
  ...claimRouteContracts,
];
