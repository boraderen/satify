const repoName =
  process.env.GITHUB_ACTIONS === "true"
    ? (process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "satify")
    : "";

export const BASE_PATH = repoName ? `/${repoName}` : "";
export const SITE_ICON_PATH = `${BASE_PATH}/satify.png`;
