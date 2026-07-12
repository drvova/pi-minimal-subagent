// Team definition types — owned by teams slice.

export interface TeamDefinition {
  name: string;
  description: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  agent: string;
  role: string;
}
