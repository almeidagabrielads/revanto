import * as z from "zod";

export const TipoGastoValues = ["FIXO", "VARIAVEL", "INVESTIMENTO"] as const;

export const TipoGastoSchema = z.enum(TipoGastoValues);

export type TipoGasto = z.infer<typeof TipoGastoSchema>;
