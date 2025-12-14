import { create } from 'zustand';
import { Job } from './types';

interface JobState {
  jobs: Record<string, Job>;
  addJob: (job: Job) => void;
  updateJob: (id: string, updates: Partial<Job>) => void;
}

export const useJobStore = create<JobState>((set) => ({
  jobs: {},
  addJob: (job) =>
    set((state) => ({
      jobs: { ...state.jobs, [job.id]: job },
    })),
  updateJob: (id, updates) =>
    set((state) => ({
      jobs: {
        ...state.jobs,
        [id]: { ...state.jobs[id], ...updates },
      },
    })),
}));
