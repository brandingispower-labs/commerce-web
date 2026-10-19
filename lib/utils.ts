import { ReadonlyURLSearchParams } from "next/navigation";

export const baseUrl = process.env.BASE_URL || "http://localhost:3000";

export const createUrl = (
  pathname: string,
  params: URLSearchParams | ReadonlyURLSearchParams,
) => {
  const paramsString = params.toString();
  const queryString = `${paramsString.length ? "?" : ""}${paramsString}`;

  return `${pathname}${queryString}`;
};

export const ensureStartsWith = (stringToCheck: string, startsWith: string) =>
  stringToCheck.startsWith(startsWith)
    ? stringToCheck
    : `${startsWith}${stringToCheck}`;

export const validateEnvironmentVariables = () => {
  const requiredEnvironmentVariables = [
    "MEDUSA_BACKEND_URL",
    "MEDUSA_PUBLISHABLE_KEY",
  ];
  const missingEnvironmentVariables = [] as string[];

  requiredEnvironmentVariables.forEach((envVar) => {
    if (!process.env[envVar]) {
      missingEnvironmentVariables.push(envVar);
    }
  });

  if (missingEnvironmentVariables.length) {
    throw new Error(
      `The following environment variables are missing. Your site will not work without them:\n\n${missingEnvironmentVariables.join(
        "\n",
      )}\n`,
    );
  }

  if (!process.env.MEDUSA_BACKEND_URL?.startsWith("http")) {
    throw new Error(
      "Your `MEDUSA_BACKEND_URL` environment variable must start with `http://` or `https://`.",
    );
  }
};
