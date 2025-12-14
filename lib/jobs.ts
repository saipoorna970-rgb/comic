export interface Job {
  id: string;
  type: 'translate' | 'comic';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  data: unknown;
  result?: unknown;
  createdAt: Date;
}

// Global in-memory store
export const jobStore: Record<string, Job> = {};

export const createJob = (type: Job['type'], data: unknown): Job => {
  const id = Math.random().toString(36).substring(7);
  const job: Job = {
    id,
    type,
    status: 'pending',
    progress: 0,
    data,
    createdAt: new Date(),
  };
  jobStore[id] = job;
  return job;
};

export const getJob = (id: string): Job | undefined => {
  return jobStore[id];
};

export const updateJob = (id: string, updates: Partial<Job>): Job | undefined => {
  const job = jobStore[id];
  if (!job) return undefined;
  
  Object.assign(job, updates);
  return job;
};
