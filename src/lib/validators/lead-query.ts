import { z } from "zod";

const brazilianUfs = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const approvedPriorities = ["B", "C", "E", "R"] as const;

function prepareQueryInput(
  input: unknown,
  allowedKeys: ReadonlySet<string>,
): unknown {
  const query =
    input instanceof URLSearchParams
      ? Object.fromEntries(
          [...new Set(input.keys())].map((key) => {
            const values = input.getAll(key);
            return [key, values.length === 1 ? values[0] : values];
          }),
        )
      : input;

  if (query && typeof query === "object" && !Array.isArray(query)) {
    for (const key of Object.keys(query)) {
      if (!allowedKeys.has(key)) {
        return null;
      }
    }
  }

  return query;
}

const positiveIntegerStringSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.int().min(1));

const pageSchema = positiveIntegerStringSchema.default(1);
const pageSizeSchema = positiveIntegerStringSchema
  .pipe(z.number().max(20))
  .default(20);

export const cnpjSchema = z
  .string()
  .regex(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/)
  .transform((value) => value.replace(/[./-]/g, ""));

export const leadRunIdSchema = z.string().regex(/^lr_[0-9a-f]{64}$/);

const paginationKeys = new Set(["page", "pageSize"]);
const paginationShape = {
  page: pageSchema,
  pageSize: pageSizeSchema,
};

export const leadListQuerySchema = z.preprocess(
  (input) =>
    prepareQueryInput(
      input,
      new Set([...paginationKeys, "cnpj", "uf", "priority"]),
    ),
  z.strictObject({
    ...paginationShape,
    cnpj: cnpjSchema.optional(),
    uf: z.enum(brazilianUfs).optional(),
    priority: z.enum(approvedPriorities).optional(),
  }),
);

export const leadDetailParamsSchema = z.strictObject({
  cnpj: cnpjSchema,
});

export const leadDetailQuerySchema = z.preprocess(
  (input) => prepareQueryInput(input, new Set(["leadRunId"])),
  z.strictObject({
    leadRunId: leadRunIdSchema.optional(),
  }),
);

export const leadHistoryQuerySchema = z.preprocess(
  (input) => prepareQueryInput(input, paginationKeys),
  z.strictObject(paginationShape),
);

export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export type LeadDetailParams = z.infer<typeof leadDetailParamsSchema>;
export type LeadDetailQuery = z.infer<typeof leadDetailQuerySchema>;
export type LeadHistoryQuery = z.infer<typeof leadHistoryQuerySchema>;
