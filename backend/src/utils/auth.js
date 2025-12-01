const parseClientPrincipal = (headerValue, log) => {
  if (!headerValue) {
    return null;
  }

  try {
    const decoded = Buffer.from(headerValue, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (error) {
    log?.error?.("Failed to parse client principal header", error);
    return null;
  }
};

const getUserFromRequest = (request, context) => {
  const header = request.headers.get("x-ms-client-principal");
  const user = parseClientPrincipal(header, context?.log);

  if (!user?.userId) {
    return null;
  }

  return user;
};

module.exports = { getUserFromRequest };
