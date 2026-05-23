import { capabilitySchemaToJsonSchema } from "../types.ts";
import { GetSectionRequestSchema, GetSectionResultSchema } from "./contract.ts";

export const getSectionOperationName = "get-section";

const baseGetSectionInputJsonSchema = capabilitySchemaToJsonSchema(
  GetSectionRequestSchema,
);

export const getSectionInputJsonSchema = {
  ...baseGetSectionInputJsonSchema,
  description: "기준서 섹션 하나를 조회합니다. stdNum과 섹션 locator 하나만 제공하세요: get-standard-structure의 indexDocumentId 또는 ID를 모를 때 같은 구조의 ref입니다. 브라우저 경로 titleDocumentId 값은 허용되지 않습니다.",
  oneOf: [
    {
      required: ["indexDocumentId"],
      not: { required: ["ref"] },
      description: "get-standard-structure가 반환한 조회용 indexDocumentId로 조회합니다.",
    },
    {
      required: ["ref"],
      not: { required: ["indexDocumentId"] },
      description: "get-standard-structure가 반환한 섹션 ref/range로 조회합니다.",
    },
  ],
};

export const getSectionResultJsonSchema = capabilitySchemaToJsonSchema(
  GetSectionResultSchema,
);
