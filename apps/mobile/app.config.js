/**
 * Layers deploy-time settings onto the static app.json.
 *
 * GitHub Pages serves a project site from a subpath
 * (https://<user>.github.io/<repo>/), so the web export has to be built with a
 * matching baseUrl or every asset and route resolves against the domain root
 * and 404s. Local development and native builds leave it unset.
 */
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_WEB_BASE_URL?.trim();
  if (!baseUrl) return config;

  return {
    ...config,
    experiments: { ...config.experiments, baseUrl: baseUrl.replace(/\/+$/, '') },
  };
};
