/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
/*
/*
by Campbell Galon for Oracle NetSuite
created 17.12.2019
last modified 18.12.2019

FUNCTION:
Group items together in Sales Order printouts, updating quantities and amounts in the printout.

MODUS OPERANDI:
When sales orders get printed, the script creates a hidden longtext field on the form, and then iterates through the transaction lines. For every line with an item which was not already in the lines before, the script adds an object with that line's information to an array. When an already-present item is detected, the original object will be updated to reflect total quantity and amount. (This only happens when the two lines' Rate values are the same, but this can be changed easily.) When done, the array of objects is stringified and inserted into the longtext field. The Advanced Template then parses this string back into an object and organizes it by row and column.

PREREQUISITES: 
- IDs of line item column match defaults

USAGE:
- Upload script and deploy on Sales Orders
- Customize the Sales Order Advanced PDF/HTML Template (freemarker code is in the comment at end of script)
- Apply the advanced PDF print template on the desired Sales Order transaction form(s)

*/
define(['N/record', 'N/ui/serverWidget', 'N/log'],
	function (record, serverWidget, log)
	{
		function beforeLoad(context)
		{
			try
			{
				//If start-of-script logging is desired, insert here
				if (context.type === 'print')
				{
					var form = context.form;
					var field = form.addField( //Create a longtext field to store the stringified JSON of unique line items
						{
							id: 'custpage_unique_items_json',
							type: 'LONGTEXT',
							label: 'JSON string of unique items',
						});
					field.updateDisplayType(
					{ //Hide the field from user (if the user edits it in UI, it doesn't matter for printing the sales order, but no reason for it to be visible)
						displayType: 'HIDDEN'
					});
					var salesOrder = context.newRecord;
					var LineCount = salesOrder.getLineCount(
					{
						sublistId: 'item'
					});
					var lineArray = [];
					for (i = 0; i < LineCount; i++) //for all item lines
					{
						var singleLine = {};
						var thisItem = Number(salesOrder.getSublistValue(
						{
							sublistId: 'item',
							fieldId: 'item',
							line: i
						}));
						var thisQty = Number(salesOrder.getSublistValue(
						{
							sublistId: 'item',
							fieldId: 'quantity',
							line: i
						}));
						var thisRate = Number(Number(salesOrder.getSublistValue(
						{
							sublistId: 'item',
							fieldId: 'rate',
							line: i
						})).toFixed(2));
						var thisAmt = Number(Number(salesOrder.getSublistValue(
						{
							sublistId: 'item',
							fieldId: 'amount',
							line: i
						})).toFixed(2));
						var thisItemName = salesOrder.getSublistValue(
						{
							sublistId: 'item',
							fieldId: 'name',
							line: i
						});
						var descTest = salesOrder.getSublistValue(
						{
							sublistId: 'item',
							fieldId: 'description',
							line: i
						});
						if ((descTest) && (descTest != ''))
						{
							var thisItemDesc = descTest;
						}
						else
						{
							var thisItemDesc = '';
						};
						if ((!thisQty) || (thisQty === 0))
						{
							thisQty = ''
						}
						if ((!thisAmt) || (thisAmt === 0))
						{
							thisAmt = ''
						}
						if ((!thisRate) || (thisRate === 0))
						{
							thisRate = ''
						};
						if (!thisItemName)
						{
							thisItemName = ''
						};
						singleLine = { //build one individual object, representing one unique item in the transaction, to be inserted into the array
							item: thisItem,
							quantity: thisQty,
							rate: thisRate,
							amount: thisAmt,
							name: thisItemName,
							description: thisItemDesc
						};
						if (lineArray.map(function (e) //If this item is already present in the array
								{
									return e.item;
								}).indexOf(singleLine.item) > -1)
						{
							var firstOccIndex = lineArray.map(function (e) //get line index of first occurrence
								{
									return e.item;
								}).indexOf(singleLine.item);
							if (lineArray[firstOccIndex].rate === singleLine.rate)
							{ //Only merge lines for the same item if the Rate is also the same. This way if a nonstandard price is used, the items with each rate will stay separated on the printout for better visibility. 
								var oldQty = Number(lineArray[firstOccIndex].quantity); 
								var oldAmt = Number(lineArray[firstOccIndex].amount);
								var addQty = Number(singleLine.quantity);
								var addAmt = Number(singleLine.amount);
								if (!(oldQty || addQty)) //if new or old quantity does not exist, do not show quantity
								{
									var newQty = '';
									lineArray[firstOccIndex].quantity = ""
								}
								else
								{
									var newQty = oldQty + addQty;
									lineArray[firstOccIndex].quantity = newQty; //set the quantity of the first occurrence of the item in the object to the previous total plus the current line's quantity
								}
								if (!(oldAmt || addAmt)) //if new or old amount does not exist, do not show amount
								{
									var newAmt = '';
									lineArray[firstOccIndex].amount = ''
								}
								else
								{
									var newAmt = oldAmt + addAmt;
									lineArray[firstOccIndex].amount = newAmt; //set the amount of the first occurrence of the item in the object to the previous total plus the current line's amount
								}
							}
							else if (lineArray[firstOccIndex].rate != singleLine.rate) //If the item is already present but with a different rate, don't group together
							{
								lineArray.push(singleLine); //add current line's object to array
							}
						}
						else if (lineArray.map(function (e) //if the item is not already present in the array
								{
									return e.item;
								}).indexOf(singleLine.item) === -1)
						{
							lineArray.push(singleLine); ///add current line's object to array
						};
					};
					function thousandCommas(num) { //regex function to add commas as thousand separators for currency columns
						return (num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
					   }
					function numberToCurrencyFormat(num) { //change number to a string in format '$XX,XXX,XXX.XX'
						return ('$'+thousandCommas(num.toFixed(2)));
					   }
					var howManySets = lineArray.length; //get the number of lines to be printed
					for (i = 0; i < howManySets; i++) //use function defined above to add commas as thousand separators and force 2 decimal places on all currency columns in objects in the array
					{
						if (lineArray[i].rate != "")
						{
							lineArray[i].rate = numberToCurrencyFormat(lineArray[i].rate)
						};
						if (lineArray[i].amount != "")
						{
							lineArray[i].amount = numberToCurrencyFormat(lineArray[i].amount)
						};
						if (lineArray[i].quantity != "")
						{
							lineArray[i].quantity = thousandCommas(lineArray[i].quantity)
						};
					}
					var stringifiedArray = JSON.stringify(lineArray); //convert the object to string
					var correctedArray = stringifiedArray.replace(/\$-/g, '-$'); //move negative signs outside dollar symbols
					salesOrder.setValue( //insert the edited string into the hidden longtext field, which will be parsed via ?eval by the template
						{
							fieldId: 'custpage_unique_items_json',
							value: correctedArray
						});
				}
			}
			catch (err)
			{
				log.error('ERROR: ' + err.name, err.message);
			};
		};
		return {
			beforeLoad: beforeLoad,
		};
	});

/* in the Advanced PDF/HTML Sales Order template:
get JSON values and allow them to be printed only where their indices are equal

Excerpt from one example of a working template:

<#if record.custpage_unique_items_json?has_content>
<#assign salesorder = record.custpage_unique_items_json?eval />
<table style="width: 100%; margin-top: 10px;"><!-- start items --><#list record.item as item><#if item_index==0>
<thead>
	<tr>
	<th colspan="12" style="padding: 10px 6px;">${item.item@label}</th>
    <th align="right" colspan="4" style="padding: 10px 6px;">${item.quantity@label}</th>
	<th align="right" colspan="4" style="padding: 10px 6px;">${item.rate@label}</th>
	<th align="right" colspan="4" style="padding: 10px 6px;">${item.amount@label}</th>
	</tr>
</thead>
</#if>
  <#list salesorder as salesorder_line><#if item_index==salesorder_line_index>
<tr>
	<td valign="middle" colspan="12"><span style="font-weight: bold; line-height: 150%;">${salesorder_line.name}</span><br /><span style ="font-size: 8pt;"><i>${salesorder_line.description}</i></span></td>
  	<td align="right" valign="middle" line-height="150%" colspan="4">${salesorder_line.quantity}</td>
	<td align="right" valign="middle" line-height="150%" colspan="4">${salesorder_line.rate}</td>
	<td align="right" valign="middle" line-height="150%" colspan="4">${salesorder_line.amount}</td>
	</tr>
    </#if>
  </#list><!-- end items -->
  </#list>
</table>
</#if>

*/