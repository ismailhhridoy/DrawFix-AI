// Team data for the /docs team section. Edit here; photos go in public/team/ (any size, the page crops them).
// Fields left null are simply not shown: no placeholder text reaches the public page.
export interface TeamMember {
  name: string;
  roles: string[]; // roles in the application, shown in order
  email: string | null; // only set after the member agrees to publish it
  photo: string | null; // path under public/, e.g. "/team/ismail.jpg"
  published: boolean;
}

export const TEAM_NAME = 'Team DrawFix AI';

export const TEAM: TeamMember[] = [
  { name: 'Ismail H Hridoy', roles: ['Team Lead', 'Full-Stack Developer', 'Product/UX Designer'], email: null, photo: null, published: true },
  { name: 'Barkat Ullah Shah Riyad', roles: ['Host', 'Product Advocate'], email: null, photo: null, published: true },
  { name: 'MD. Montasin Mamun', roles: ['AI/ML Engineer'], email: null, photo: null, published: true },
  { name: 'Md Arafat Islam', roles: ['Backend Developer'], email: null, photo: null, published: true },
];
