"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { HttpClient } from "../interfaces/http-client";
import type { ConfigClient } from "../interfaces/config-client";
import type { PipelineRepository } from "@/features/pipeline/interfaces/pipeline-repository";
import { AppConfigServiceAdapter } from "../services/app-config-service.adapter";
import { FetchHttpServiceAdapter } from "../services/fetch-http-service.adapter";
import { HttpPipelineRepository } from "@/features/pipeline/repositories/http-pipeline.repository";

export interface AppDependenciesContextValue {
  httpClient: HttpClient;
  configService: ConfigClient;
  pipelineRepository: PipelineRepository;
}

const AppDependenciesContext =
  createContext<AppDependenciesContextValue | null>(null);

export const AppDependenciesProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const dependencies = useMemo(() => {
    const configService = new AppConfigServiceAdapter();
    const httpClient = new FetchHttpServiceAdapter(configService);
    const pipelineRepository = new HttpPipelineRepository(httpClient);
    return { httpClient, configService, pipelineRepository };
  }, []);

  return (
    <AppDependenciesContext value={dependencies}>
      {children}
    </AppDependenciesContext>
  );
};

export const useAppDependencies = (): AppDependenciesContextValue => {
  const context = useContext(AppDependenciesContext);
  if (!context) {
    throw new Error(
      "useAppDependencies must be used within AppDependenciesProvider"
    );
  }
  return context;
};
