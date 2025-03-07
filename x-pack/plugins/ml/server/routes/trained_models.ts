/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { RouteInitialization } from '../types';
import { wrapError } from '../client/error_wrapper';
import {
  getInferenceQuerySchema,
  inferTrainedModelBody,
  inferTrainedModelQuery,
  modelIdSchema,
  optionalModelIdSchema,
  pipelineSimulateBody,
  putTrainedModelQuerySchema,
  threadingParamsSchema,
  updateDeploymentParamsSchema,
} from './schemas/inference_schema';

import { TrainedModelConfigResponse } from '../../common/types/trained_models';
import { mlLog } from '../lib/log';
import { forceQuerySchema } from './schemas/anomaly_detectors_schema';
import { modelsProvider } from '../models/model_management';

export function trainedModelsRoutes({ router, routeGuard }: RouteInitialization) {
  /**
   * @apiGroup TrainedModels
   *
   * @api {get} /api/ml/trained_models/:modelId Get info of a trained inference model
   * @apiName GetTrainedModel
   * @apiDescription Retrieves configuration information for a trained model.
   */
  router.get(
    {
      path: '/api/ml/trained_models/{modelId?}',
      validate: {
        params: optionalModelIdSchema,
        query: getInferenceQuerySchema,
      },
      options: {
        tags: ['access:ml:canGetTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, request, response }) => {
      try {
        const { modelId } = request.params;
        const { with_pipelines: withPipelines, ...query } = request.query;
        const body = await mlClient.getTrainedModels({
          // @ts-expect-error @elastic-elasticsearch not sure why this is an error, size is a number
          size: 1000,
          ...query,
          ...(modelId ? { model_id: modelId } : {}),
        });
        // model_type is missing
        // @ts-ignore
        const result = body.trained_model_configs as TrainedModelConfigResponse[];
        try {
          if (withPipelines) {
            // Also need to retrieve the list of deployment IDs from stats
            const stats = await mlClient.getTrainedModelsStats({
              ...(modelId ? { model_id: modelId } : {}),
              size: 10000,
            });

            const modelDeploymentsMap = stats.trained_model_stats.reduce((acc, curr) => {
              if (!curr.deployment_stats) return acc;
              // @ts-ignore elasticsearch-js client is missing deployment_id
              const deploymentId = curr.deployment_stats.deployment_id;
              if (acc[curr.model_id]) {
                acc[curr.model_id].push(deploymentId);
              } else {
                acc[curr.model_id] = [deploymentId];
              }
              return acc;
            }, {} as Record<string, string[]>);

            const modelIdsAndAliases: string[] = Array.from(
              new Set([
                ...result
                  .map(({ model_id: id, metadata }) => {
                    return [id, ...(metadata?.model_aliases ?? [])];
                  })
                  .flat(),
                ...Object.values(modelDeploymentsMap).flat(),
              ])
            );

            const pipelinesResponse = await modelsProvider(client).getModelsPipelines(
              modelIdsAndAliases
            );
            for (const model of result) {
              model.pipelines = {
                ...(pipelinesResponse.get(model.model_id) ?? {}),
                ...(model.metadata?.model_aliases ?? []).reduce((acc, alias) => {
                  return {
                    ...acc,
                    ...(pipelinesResponse.get(alias) ?? {}),
                  };
                }, {}),
                ...(modelDeploymentsMap[model.model_id] ?? []).reduce((acc, deploymentId) => {
                  return {
                    ...acc,
                    ...(pipelinesResponse.get(deploymentId) ?? {}),
                  };
                }, {}),
              };
            }
          }
        } catch (e) {
          // the user might not have required permissions to fetch pipelines
          // log the error to the debug log as this might be a common situation and
          // we don't need to fill kibana's log with these messages.
          mlLog.debug(e);
        }

        return response.ok({
          body: result,
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );

  /**
   * @apiGroup TrainedModels
   *
   * @api {get} /api/ml/trained_models/_stats Get stats for all trained models
   * @apiName GetTrainedModelStats
   * @apiDescription Retrieves usage information for all trained models.
   */
  router.get(
    {
      path: '/api/ml/trained_models/_stats',
      validate: false,
      options: {
        tags: ['access:ml:canGetTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
      try {
        const body = await mlClient.getTrainedModelsStats();
        return response.ok({
          body,
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );

  /**
   * @apiGroup TrainedModels
   *
   * @api {get} /api/ml/trained_models/:modelId/_stats Get stats of a trained model
   * @apiName GetTrainedModelStatsById
   * @apiDescription Retrieves usage information for trained models.
   */
  router.get(
    {
      path: '/api/ml/trained_models/{modelId}/_stats',
      validate: {
        params: modelIdSchema,
      },
      options: {
        tags: ['access:ml:canGetTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
      try {
        const { modelId } = request.params;
        const body = await mlClient.getTrainedModelsStats({
          ...(modelId ? { model_id: modelId } : {}),
        });
        return response.ok({
          body,
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );

  /**
   * @apiGroup TrainedModels
   *
   * @api {get} /api/ml/trained_models/:modelId/pipelines Get trained model pipelines
   * @apiName GetTrainedModelPipelines
   * @apiDescription Retrieves pipelines associated with a trained model
   */
  router.get(
    {
      path: '/api/ml/trained_models/{modelId}/pipelines',
      validate: {
        params: modelIdSchema,
      },
      options: {
        tags: ['access:ml:canGetTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ client, request, mlClient, response }) => {
      try {
        const { modelId } = request.params;
        const result = await modelsProvider(client).getModelsPipelines(modelId.split(','));
        return response.ok({
          body: [...result].map(([id, pipelines]) => ({ model_id: id, pipelines })),
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );

  /**
   * @apiGroup TrainedModels
   *
   * @api {put} /api/ml/trained_models/:modelId Put a trained model
   * @apiName PutTrainedModel
   * @apiDescription Adds a new trained model
   */
  router.put(
    {
      path: '/api/ml/trained_models/{modelId}',
      validate: {
        params: modelIdSchema,
        body: schema.any(),
        query: putTrainedModelQuerySchema,
      },
      options: {
        tags: ['access:ml:canCreateTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
      try {
        const { modelId } = request.params;
        const body = await mlClient.putTrainedModel({
          model_id: modelId,
          body: request.body,
          ...(request.query?.defer_definition_decompression
            ? { defer_definition_decompression: true }
            : {}),
        });
        return response.ok({
          body,
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );

  /**
   * @apiGroup TrainedModels
   *
   * @api {delete} /api/ml/trained_models/:modelId Delete a trained model
   * @apiName DeleteTrainedModel
   * @apiDescription Deletes an existing trained model that is currently not referenced by an ingest pipeline.
   */
  router.delete(
    {
      path: '/api/ml/trained_models/{modelId}',
      validate: {
        params: modelIdSchema,
      },
      options: {
        tags: ['access:ml:canDeleteTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
      try {
        const { modelId } = request.params;
        const body = await mlClient.deleteTrainedModel({
          model_id: modelId,
        });
        return response.ok({
          body,
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );

  /**
   * @apiGroup TrainedModels
   *
   * @api {post} /api/ml/trained_models/:modelId/deployment/_start Start trained model deployment
   * @apiName StartTrainedModelDeployment
   * @apiDescription Starts trained model deployment.
   */
  router.post(
    {
      path: '/api/ml/trained_models/{modelId}/deployment/_start',
      validate: {
        params: modelIdSchema,
        query: threadingParamsSchema,
      },
      options: {
        tags: ['access:ml:canStartStopTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
      try {
        const { modelId } = request.params;
        const body = await mlClient.startTrainedModelDeployment({
          model_id: modelId,
          ...(request.query ? request.query : {}),
        });
        return response.ok({
          body,
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );

  /**
   * @apiGroup TrainedModels
   *
   * @api {post} /api/ml/trained_models/:modelId/deployment/_update Update trained model deployment
   * @apiName UpdateTrainedModelDeployment
   * @apiDescription Updates trained model deployment.
   */
  router.post(
    {
      path: '/api/ml/trained_models/{modelId}/deployment/_update',
      validate: {
        params: modelIdSchema,
        body: updateDeploymentParamsSchema,
      },
      options: {
        tags: ['access:ml:canStartStopTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
      try {
        const { modelId } = request.params;
        const body = await mlClient.updateTrainedModelDeployment({
          model_id: modelId,
          ...request.body,
        });
        return response.ok({
          body,
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );

  /**
   * @apiGroup TrainedModels
   *
   * @api {post} /api/ml/trained_models/:modelId/deployment/_stop Stop trained model deployment
   * @apiName StopTrainedModelDeployment
   * @apiDescription Stops trained model deployment.
   */
  router.post(
    {
      path: '/api/ml/trained_models/{modelId}/deployment/_stop',
      validate: {
        params: modelIdSchema,
        query: forceQuerySchema,
      },
      options: {
        tags: ['access:ml:canStartStopTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
      try {
        const { modelId } = request.params;
        const body = await mlClient.stopTrainedModelDeployment({
          model_id: modelId,
          force: request.query.force ?? false,
        });
        return response.ok({
          body,
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );

  /**
   * @apiGroup TrainedModels
   *
   * @api {post} /api/ml/trained_models/pipeline_simulate Simulates an ingest pipeline
   * @apiName SimulateIngestPipeline
   * @apiDescription Simulates an ingest pipeline.
   */
  router.post(
    {
      path: '/api/ml/trained_models/pipeline_simulate',
      validate: {
        body: pipelineSimulateBody,
      },
      options: {
        tags: ['access:ml:canTestTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ client, request, response }) => {
      try {
        const { pipeline, docs } = request.body;
        const body = await client.asInternalUser.ingest.simulate({
          pipeline,
          docs,
        });
        return response.ok({
          body,
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );

  /**
   * @apiGroup TrainedModels
   *
   * @api {post} /api/ml/trained_models/infer/:modelId Evaluates a trained model
   * @apiName InferTrainedModelDeployment
   * @apiDescription Evaluates a trained model.
   */
  router.post(
    {
      path: '/api/ml/trained_models/infer/{modelId}',
      validate: {
        params: modelIdSchema,
        query: inferTrainedModelQuery,
        body: inferTrainedModelBody,
      },
      options: {
        tags: ['access:ml:canTestTrainedModels'],
      },
    },
    routeGuard.fullLicenseAPIGuard(async ({ mlClient, request, response }) => {
      try {
        const { modelId } = request.params;
        const body = await mlClient.inferTrainedModel({
          model_id: modelId,
          body: {
            docs: request.body.docs,
            ...(request.body.inference_config
              ? { inference_config: request.body.inference_config }
              : {}),
          },
          ...(request.query.timeout ? { timeout: request.query.timeout } : {}),
        });
        return response.ok({
          body,
        });
      } catch (e) {
        return response.customError(wrapError(e));
      }
    })
  );
}
