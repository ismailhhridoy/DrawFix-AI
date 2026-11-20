// Team data for the /docs team section. Edit here; photos go in public/team/ (any size, the page crops them).
// Fields left null are simply not shown: no placeholder text reaches the public page.
export interface TeamMember {
  name: string;
  role: string;
  email: string | null; // only set after the member agrees to publish it
  photo: string | null; // path under public/, e.g. "/team/ismail.jpg"
  published: boolean;
}

export const TEAM_NAME = 'Team DrawFix AI';

export const TEAM: TeamMember[] = [
  {
    name: 'Ismail H Hridoy',
    role: 'Founder. Product, engineering and the launch film.',
    email: null,
    photo: null,
    published: true,
  },
];
