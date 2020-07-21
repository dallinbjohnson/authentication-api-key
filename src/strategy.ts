import { Params, Service } from "@feathersjs/feathers";
import { NotAuthenticated } from "@feathersjs/errors";
import { IncomingMessage, ServerResponse } from "http";
import {
  AuthenticationBaseStrategy,
  AuthenticationResult
} from "@feathersjs/authentication";

export class ApiKeyStrategy extends AuthenticationBaseStrategy {
  private serviceBased: boolean = false;
  constructor() {
    super();
  }

  verifyConfiguration() {
    this.serviceBased = ["service", "entity"].every(
      prop => prop in this.configuration
    );
    if (!this.serviceBased) {
      if (!("keys" in this.configuration)) {
        throw new Error(
          `A static keys is missing, when strategy '${this.name}', is not service based`
        );
      }
    }
    ["headerField"].forEach(prop => {
      if (prop in this.configuration) return;
      throw new Error(`'${prop}' is missing from configuration`);
    });
  }

  get configuration() {
    const config = super.configuration || {};
    return { errorMessage: "Invalid API key", entity: "api-key", ...config };
  }

  async findEntity(apiKey: string, params: Params) {
    const { errorMessage, entity } = this.configuration;
    try {
      const result = await this.entityService.find({
        query: { [entity]: apiKey, $limit: 1 }
      });
      if (result.total === 0) {
        throw new NotAuthenticated(errorMessage);
      }
      return result.data[0];
    } catch (error) {
      throw new NotAuthenticated(errorMessage);
    }
  }

  async authenticate(authRequest: AuthenticationResult, params: Params) {
    const {
      keys,
      errorMessage,
      entity,
      revokedField,
      authorizedField,
      activeField,
      headerField
    } = this.configuration;
    const apiKey = authRequest[entity];
    const result = {
      authentication: {
        strategy: this.name,
        [entity]: apiKey
      },
      headers: {
        ...params.headers,
        [headerField]: apiKey
      },
      apiKey: true,
      [entity]: {}
    };

    if (!this.serviceBased) {
      if (!keys.includes(apiKey)) throw new NotAuthenticated(errorMessage);
      return result;
    }

    const apiKeyData = await this.findEntity(apiKey, params);
    if (revokedField in apiKeyData) {
      if (apiKeyData[revokedField]) {
        throw new NotAuthenticated("API Key has been revoked");
      }
    }
    if (authorizedField in apiKeyData) {
      if (!apiKeyData[authorizedField]) {
        throw new NotAuthenticated("API Key has not been authorized");
      }
    }
    if (activeField in apiKeyData) {
      if (!apiKeyData[activeField]) {
        throw new NotAuthenticated("API Key is not active");
      }
    }

    return Object.assign(Object.assign({}, result), { [entity]: apiKeyData });
  }

  async parse(req: IncomingMessage, res: ServerResponse) {
    const { headerField, entity } = this.configuration;
    const apiKey = req.headers[headerField];
    if (apiKey) {
      return {
        strategy: this.name,
        [entity]: apiKey
      };
    }

    return null;
  }
}