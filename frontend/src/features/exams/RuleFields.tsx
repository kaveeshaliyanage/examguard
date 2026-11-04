import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { CreateRuleInput, ResourceCategory } from '../../api/types';
import { describeDomainRule } from '../../lib/domains';

interface RuleFieldsProps {
  rules: CreateRuleInput[];
  onChange: (rules: CreateRuleInput[]) => void;
  error: string | null;
}

const categories: ResourceCategory[] = ['PERMITTED', 'PROHIBITED'];

function preview(pattern: string): { label: string; body: string; invalid: boolean } {
  const kind = describeDomainRule(pattern);
  switch (kind) {
    case 'wildcard':
      return {
        label: 'Wildcard',
        body: `Matches any subdomain of ${pattern.trim().slice(2)}.`,
        invalid: false,
      };
    case 'regex':
      return { label: 'Regular expression', body: 'Valid regular expression.', invalid: false };
    case 'invalid':
      return { label: 'Invalid regex', body: 'Fix the expression: it cannot be compiled.', invalid: true };
    case 'empty':
      return { label: 'Empty', body: 'Enter a domain pattern.', invalid: true };
    default:
      return {
        label: 'Exact host',
        body: `Matches ${pattern.trim()} and its subdomains.`,
        invalid: false,
      };
  }
}

export function RuleFields({ rules, onChange, error }: RuleFieldsProps) {
  const update = (index: number, patch: Partial<CreateRuleInput>) => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6">Resource rules</Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() =>
            onChange([...rules, { category: 'PERMITTED', domainPattern: '', note: null }])
          }
        >
          Add rule
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Rules classify observed domains for human review. They do not block navigation.
      </Typography>
      {error ? (
        <Typography color="error" variant="body2" sx={{ mb: 1 }}>
          {error}
        </Typography>
      ) : null}
      <Stack spacing={2}>
        {rules.map((rule, index) => {
          const info = preview(rule.domainPattern);
          return (
            <Box key={index}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
                <TextField
                  select
                  label="Category"
                  value={rule.category}
                  onChange={(event) =>
                    update(index, { category: event.target.value as ResourceCategory })
                  }
                  sx={{ width: { xs: '100%', sm: 160 } }}
                >
                  {categories.map((category) => (
                    <MenuItem key={category} value={category}>
                      {category}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Domain pattern"
                  placeholder="*.edu or docs.example.com or re:^api\\."
                  value={rule.domainPattern}
                  onChange={(event) => update(index, { domainPattern: event.target.value })}
                  error={info.invalid && rule.domainPattern.length > 0}
                  fullWidth
                />
                <TextField
                  label="Note"
                  value={rule.note ?? ''}
                  onChange={(event) => update(index, { note: event.target.value || null })}
                  sx={{ width: { xs: '100%', sm: 220 } }}
                />
                <IconButton
                  aria-label={`Remove rule ${index + 1}`}
                  onClick={() => onChange(rules.filter((_, i) => i !== index))}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Stack>
              {rule.domainPattern ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                  <Chip
                    size="small"
                    label={info.label}
                    color={info.invalid ? 'error' : 'default'}
                    variant="outlined"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {info.body}
                  </Typography>
                </Stack>
              ) : null}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
