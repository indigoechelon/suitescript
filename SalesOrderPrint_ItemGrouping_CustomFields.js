/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
/*
/*
by Campbell Galon for Oracle NetSuite
created 16.12.2019
last modified 16.12.2019

FUNCTION:
Group items together in Sales Order printouts, updating quantities and amounts in the printout.

MODUS OPERANDI:
When sales orders are saved, iterate through all transaction lines. If it's the item's first occurrence in the list, then keep a hidden checkbox checked, and copy the line's Quantity and Amount to hidden custom line fields. If the line item was already in the items previously checked, then uncheck the checkbox, and increase the original line's custom Quantity and Amount fields by the current line's Quantity and Amount. Set the checkbox as a condition in the template, and then pull values from the custom Quantity and Amount fields to be printed.

PREREQUISITES: 
1. create Transaction Line Field, type Check Box, applies to Sale Item, display type Hidden, default checked, ID custcol_first_occurrence
2. create Transaction Line Field, type Decimal Number, applies to Sale Item, display type Hidden, default empty, ID custcol_total_quantity
3. create Transaction Line Field, type Currency, applies to Sale Item, display type Hidden, default empty, ID custcol_total_amount

USAGE:
- Upload script and deploy on Sales Orders
- Customize the Sales Order Advanced PDF/HTML Template (freemarker code is in the comment at end of script)
- Apply the advanced PDF print template on the desired Sales Order transaction form(s)

 */
define(['N/record', 'N/log'],
	function (record, log)
	{
		function beforeSubmit(scriptContext)
		{
			try
			{
				//If start-of-script logging is desired, insert here
				var salesOrder = scriptContext.newRecord
				var numLines = salesOrder.getLineCount(
				{
					sublistId: 'item'
				});
				var itemIds = []; //create an array for IDs
				for (var i = 0; i < numLines; i++) // for each line of the transaction, get item ID, quantity, and amount
				{
					var thisItemId = salesOrder.getSublistValue(
					{
						sublistId: 'item',
						fieldId: 'item',
						line: i
					});
					var thisItemQty = salesOrder.getSublistValue(
					{
						sublistId: 'item',
						fieldId: 'quantity',
						line: i
					});
					var thisItemAmt = salesOrder.getSublistValue(
					{
						sublistId: 'item',
						fieldId: 'amount',
						line: i
					});
					if (itemIds.indexOf(thisItemId) === -1)
					{ //If the item is not yet in the list, check the hidden First Occurrence checkbox, and populate the Total Quantity and Total Amount custom fields
						salesOrder.setSublistValue(
						{
							sublistId: 'item',
							fieldId: 'custcol_first_occurrence',
							line: i,
							value: true
						});
						salesOrder.setSublistValue(
						{
							sublistId: 'item',
							fieldId: 'custcol_total_quantity',
							line: i,
							value: thisItemQty
						});
						salesOrder.setSublistValue(
						{
							sublistId: 'item',
							fieldId: 'custcol_total_amount',
							line: i,
							value: thisItemAmt
						});
					}
					else
					{ //If the item is already in the list, uncheck the hidden First Occurrence checkbox, go back to the first line containing an item with the same ID, and update that line's quantity and amount to reflect the sum of both lines' quantities and amounts
						var origItemIndex = itemIds.indexOf(thisItemId)
						salesOrder.setSublistValue(
						{
							sublistId: 'item',
							fieldId: 'custcol_first_occurrence',
							line: i,
							value: false
						});
						var origRunQty = salesOrder.getSublistValue(
						{
							sublistId: 'item',
							fieldId: 'custcol_total_quantity',
							line: origItemIndex
						})
						if (!(origRunQty || thisItemQty))
						{ // If either old or new quantity is undefined, then total quantity is also undefined
							salesOrder.setSublistValue(
							{
								sublistId: 'item',
								fieldId: 'custcol_total_quantity',
								line: origItemIndex,
								value: undefined
							});
						}
						else
						{
							salesOrder.setSublistValue(
							{
								sublistId: 'item',
								fieldId: 'custcol_total_quantity',
								line: origItemIndex,
								value: origRunQty + thisItemQty
							});
						};
						var origAmount = salesOrder.getSublistValue(
						{
							sublistId: 'item',
							fieldId: 'custcol_total_amount',
							line: origItemIndex
						})
						if (!(origAmount || thisItemAmt))
						{ // If either old or new amount is undefined, then total amount is also undefined
							salesOrder.setSublistValue(
							{
								sublistId: 'item',
								fieldId: 'custcol_total_amount',
								line: origItemIndex,
								value: undefined
							});
						}
						else
						{
							salesOrder.setSublistValue(
							{
								sublistId: 'item',
								fieldId: 'custcol_total_amount',
								line: origItemIndex,
								value: origAmount + thisItemAmt
							});
						}
					}
					itemIds.push(thisItemId); //Add this line's item ID to the array. This ensures the integrity of the index. Having duplicate values in this array doesn't matter, as the indexOf() function only retrieves the index of the first occurrence of the search string, which is the line marked as firstOccurrence here.
				}
			}
			catch (err)
			{
				log.error('ERROR: ' + err.name, err.message);
			}
		}
		return {
			beforeSubmit: beforeSubmit
		};
	});

/* in the Advanced PDF/HTML Sales Order template:
- check if a line has the hidden First Occurrence checkbox checked
    - if not, do not print
    - if yes, print using the Total Quantity, Rate, and Total Amount fields

Excerpt from one example of a working template:

        <table style="width: 100%; margin-top: 10px;"><!-- start items --><#list record.item as item><#if item_index==0>
            <thead>
                <tr>
                    <th align="center" colspan="3" style="padding: 10px 6px;">${item.quantity@label}</th>
                    <th colspan="12" style="padding: 10px 6px;">${item.item@label}</th>
                    <th align="right" colspan="4" style="padding: 10px 6px;">${item.rate@label}</th>
                    <th align="right" colspan="4" style="padding: 10px 6px;">${item.amount@label}</th>
                </tr>
            </thead>
        </#if>
        <#if item.custcol_first_occurrence=="T">
            <tr>
                <td align="center" colspan="3" line-height="150%">${item.custcol_total_quantity}</td>
                <td colspan="12"><span style="font-weight: bold; line-height: 150%; color: #333333;">${item.item}</span><br />${item.description}</td>
                <td align="right" colspan="4">${item.rate}</td>
                <td align="right" colspan="4">${item.custcol_total_amount}</td>
            </tr>
        </#if>
        </#list><!-- end items --></table>

*/