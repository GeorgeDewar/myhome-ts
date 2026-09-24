import * as babelPlugin from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";
import * as prettier from "prettier/standalone";
import prettierConfig from "../../../.prettierrc.json";
import type { Plan } from "../Plan";

const prettierOptions = {
  ...prettierConfig,
  parser: "json",
  plugins: [babelPlugin, estreePlugin],
  objectWrap: prettierConfig.objectWrap as "collapse",
};

export async function formatPlanJson(plan: Plan) {
  return prettier.format(JSON.stringify(plan.toJson()), prettierOptions);
}
