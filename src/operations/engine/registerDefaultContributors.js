import { registerOperationsContributor, getOperationsContributors } from './contributorRegistry';
import { facilitiesContributor } from '../contributors/facilitiesContributor';
import { inventoryContributor } from '../contributors/inventoryContributor';
import { temperatureContributor } from '../contributors/temperatureContributor';
import { placeholderContributors } from '../contributors/placeholderContributors';

export function registerDefaultOperationsContributors() {
  if (getOperationsContributors().length) return;
  [facilitiesContributor, inventoryContributor, temperatureContributor, ...placeholderContributors]
    .forEach(registerOperationsContributor);
}
