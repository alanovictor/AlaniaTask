export type Priority = 'urgent' | 'high' | 'medium' | 'low'
export type Status = 'todo' | 'in_progress' | 'waiting' | 'done' | 'validated'
export type Theme = 'system' | 'dark' | 'light'
export type Lang = 'pt' | 'en'

export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low']
export const STATUSES: Status[] = ['todo', 'in_progress', 'waiting', 'done', 'validated']
export const CLOSED: Status[] = ['done', 'validated']

export const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: '#e5484d',
  high: '#f5a524',
  medium: '#4c8dff',
  low: '#8b8a85',
}

export const STATUS_COLOR: Record<Status, string> = {
  todo: '#8b8a85',
  in_progress: '#4c8dff',
  waiting: '#b38cff',
  done: '#30a46c',
  validated: '#12a594',
}

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export interface Area {
  id: string
  name: string
  color: string
  position: number
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Subtask {
  id: string
  task_id: string
  title: string
  done: boolean
  position: number
}

export interface Task {
  id: string
  area_id: string | null
  title: string
  description: string | null
  priority: Priority
  status: Status
  date: string | null
  time: string | null
  requires_validation: boolean
  completed_at: string | null
  position: number
  created_at: string
  updated_at: string
  subtasks: Subtask[]
  task_tags: { tag_id: string }[]
}

export const AREA_COLORS = ['#d97757', '#e5484d', '#f5a524', '#30a46c', '#12a594', '#4c8dff', '#b38cff', '#e93d82', '#8b8a85']
